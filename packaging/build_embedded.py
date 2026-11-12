"""Package COI Planner as a portable program on python.org's embeddable Python (run on Windows by the build recipe).

    dist/COI-Planner/
        COI-Planner.cmd           starts python\\pythonw.exe app\\coi_planner.py (a program window, Edge WebView2)
        COI-Planner-Browser.cmd   fallback: the planner in its own Edge/Chrome window
        app.json                  how PocketApps lists, starts and updates it
        python/                   the embeddable Python + pywebview + pythonnet (no Tk needed)
        app/                      coi_planner.py, planner_api.py, summarize.py, COI-Planner.html
        Exporter/source/          the game mod's C# source; the program compiles it on the user's PC, against their game
        Data/                     everything the program saves (created on first start)
    python packaging/build_embedded.py [--version 1.2.3] [--out dist/COI-Planner] [--no-pip] [--layout-only]

--layout-only: only assemble the folder (no downloads, no pip, no start check); used by the tests.
Same packaging idea as PocketApps / PocketBuilder (Cagcody1).
"""
import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The window libraries. All are installed as wheels (nothing is compiled on the build PC) except proxy_tools: a 6 kB
# pure-Python helper that pywebview needs and that is published only as source. A wheels-only install makes pip call every
# pywebview version "conflicting dependencies", and its source build is needless work, so build_embedded fetches that one
# file itself and checks it against the SHA-256 pinned here.
PROXY_TOOLS_URL = "https://files.pythonhosted.org/packages/f2/cf/77d3e19b7fabd03895caca7857ef51e4c409e0ca6b37ee6e9f7daa50b642/proxy_tools-0.1.0.tar.gz"
PROXY_TOOLS_SHA256 = "ccb3751f529c047e2d8a58440d86b205303cf0fe8146f784d1cbcd94f0a28010"
PIP_STEPS = [["--no-deps", "pywebview>=5.0"],                      # pywebview itself, without its dependency list
             ["pythonnet>=3.0.3", "bottle", "typing_extensions"]]  # everything else it needs, resolved normally (wheels)
ZIP_GLOB = "COI-Planner-Portable-v*.zip"
LAST_WINDOWS_BUILD = {"3.11": "3.11.9", "3.12": "3.12.10", "3.13": "3.13.9"}


def py_tag() -> str:
    return f"{sys.version_info.major}{sys.version_info.minor}"


def embed_url(version: str) -> str:
    return f"https://www.python.org/ftp/python/{version}/python-{version}-embed-amd64.zip"


def pth_lines(tag: str) -> list[str]:
    """python3XX._pth: what the embedded interpreter puts on sys.path (and nothing else: no user site, no registry)."""
    return [f"python{tag}.zip", ".", "Lib", r"Lib\site-packages", r"..\app"]


def embed_candidates(version: str) -> list[str]:
    """Runtimes to try, best first: the build Python's own version if python.org has a Windows build of it, the last
    Windows build of the series, then earlier patch releases (the runtime must match the wheels' Python series)."""
    major, minor, patch = (int(x) for x in version.split(".")[:3])
    series = f"{major}.{minor}"
    last = LAST_WINDOWS_BUILD.get(series)
    out = []
    if last is None or patch <= int(last.split(".")[2]):
        out.append(version)
    if last and last not in out:
        out.append(last)
    out += [f"{series}.{p}" for p in range(patch, -1, -1) if f"{series}.{p}" not in out]
    return out


def fetch_embeddable(version: str, cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    cands = embed_candidates(version)
    for cand in cands:
        zip_path = cache / f"python-{cand}-embed-amd64.zip"
        if zip_path.exists() and zip_path.stat().st_size > 1_000:
            print(f"using the cached {zip_path.name}")
            return zip_path
    problems = []
    for cand in cands:
        zip_path = cache / f"python-{cand}-embed-amd64.zip"
        for attempt in (1, 2):
            try:
                print(f"downloading {embed_url(cand)}")
                part = zip_path.with_suffix(".part")
                with urllib.request.urlopen(embed_url(cand), timeout=60) as r, open(part, "wb") as f:
                    shutil.copyfileobj(r, f)
                part.replace(zip_path)
                return zip_path
            except urllib.error.HTTPError as e:
                zip_path.with_suffix(".part").unlink(missing_ok=True)
                if e.code == 404:
                    break
                problems.append(f"{cand}: HTTP {e.code}")
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                zip_path.with_suffix(".part").unlink(missing_ok=True)
                problems.append(f"{cand} (try {attempt}): {getattr(e, 'reason', e)}")
    raise SystemExit("could not download an embeddable Python from python.org"
                     + (":\n  " + "\n  ".join(problems) if problems else f" for the {version} series")
                     + f"\nCheck the internet connection, or put python-{version}-embed-amd64.zip into {cache}.")


def install_proxy_tools(site: Path, fetch=None) -> None:
    """Puts proxy_tools (one file, MIT, last release 0.1.0) into site-packages after checking the download's SHA-256."""
    def download(url):
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.read()
    data = (fetch or download)(PROXY_TOOLS_URL)
    if hashlib.sha256(data).hexdigest() != PROXY_TOOLS_SHA256:
        raise SystemExit("proxy_tools download does not match its pinned SHA-256; refusing to use it")
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        member = t.getmember("proxy_tools-0.1.0/proxy_tools/__init__.py")
        target = site / "proxy_tools"
        target.mkdir(parents=True, exist_ok=True)
        (target / "__init__.py").write_bytes(t.extractfile(member).read())
    print("proxy_tools 0.1.0 installed (checked against the pinned SHA-256)")


def app_json(version: str | None) -> dict:
    meta = {"name": "COI Planner", "exe": "python/pythonw.exe", "args": ["app/coi_planner.py"], "category": "Games",
            "description": "Captain of Industry factory planner: production chains, flex-loop designer, game-data exporter",
            "github": "Cagcody1/Pocket-COIPlanner", "asset": ZIP_GLOB, "data": ["Data"]}
    if version:
        meta["version"] = "v" + version.lstrip("v")
    return meta


LAUNCHER = ('@echo off\r\n'
            'rem COI Planner: opens the program window. If it does not start, use COI-Planner-Browser.cmd.\r\n'
            'start "" "%~dp0python\\pythonw.exe" "%~dp0app\\coi_planner.py" %*\r\n')


EXPORTER_SOURCE = ("PlannerDataExporter.cs", "manifest.json", "LICENSE-THIRD-PARTY", "summarize.py")


def assemble(out: Path, ui: Path, version: str | None) -> None:
    """Everything except the Python runtime: app files, launchers, readme, app.json, the mod's source."""
    app = out / "app"
    app.mkdir(parents=True, exist_ok=True)
    if not ui.exists():
        raise SystemExit(f"the planner page is missing: {ui} (run: npm run build:single)")
    shutil.copy2(ui, app / "COI-Planner.html")
    for src in (ROOT / "desktop" / "coi_planner.py", ROOT / "desktop" / "planner_api.py", ROOT / "tools" / "exporter" / "summarize.py"):
        shutil.copy2(src, app / src.name)
    (out / "COI-Planner.cmd").write_bytes(LAUNCHER.encode("ascii"))
    for name in ("COI-Planner-Browser.cmd", "README.txt"):
        src = ROOT / "packaging" / ("README-portable.txt" if name == "README.txt" else name)
        shutil.copy2(src, out / name)
    (out / "Data").mkdir(exist_ok=True)
    (out / "Data" / "README.txt").write_text("Everything the program saves lives in this folder. Keep it when you update.\n", encoding="utf-8")
    (out / "app.json").write_text(json.dumps(app_json(version), indent=2) + "\n", encoding="utf-8")
    (out / "Exporter" / "source").mkdir(parents=True)
    for name in EXPORTER_SOURCE:
        shutil.copy2(ROOT / "tools" / "exporter" / name, out / "Exporter" / "source" / name)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "dist" / "COI-Planner"))
    ap.add_argument("--ui", default=str(ROOT / "dist-single" / "coi-planner.html"))
    ap.add_argument("--version", default=None)
    ap.add_argument("--no-pip", action="store_true")
    ap.add_argument("--layout-only", action="store_true")
    a = ap.parse_args(argv)
    out = Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    assemble(out, Path(a.ui), a.version)
    if a.layout_only:
        return 0
    if os.name != "nt":
        raise SystemExit("This packaging runs on Windows.")
    version = "{}.{}.{}".format(*sys.version_info[:3])
    py_dir = out / "python"
    py_dir.mkdir()
    cache = Path(os.environ.get("COI_PLANNER_CACHE") or (ROOT / "build" / "cache")) / "python-embed"
    with zipfile.ZipFile(fetch_embeddable(version, cache)) as z:
        z.extractall(py_dir)
    (py_dir / f"python{py_tag()}._pth").write_text("\n".join(pth_lines(py_tag())) + "\n", encoding="ascii")
    site = py_dir / "Lib" / "site-packages"
    site.mkdir(parents=True)
    if not a.no_pip:
        for step in PIP_STEPS:
            subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--only-binary=:all:", "--target", str(site)] + step, check=True)
        install_proxy_tools(site)
    # Start the program exactly as its launcher does (the packaged python.exe, the script path) and let it check itself.
    r = subprocess.run([str(py_dir / "python.exe"), str(out / "app" / "coi_planner.py"), "--check"], capture_output=True, text=True, timeout=180)
    print(r.stdout.strip())
    if r.returncode != 0:
        print(r.stderr.strip())
        raise SystemExit(f"the packaged program failed its start check (exit {r.returncode}); see the messages above")
    print(f"built {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
