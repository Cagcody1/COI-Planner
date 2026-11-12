import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "desktop"))
sys.path.insert(0, str(ROOT / "tools" / "exporter"))
import planner_api  # noqa: E402


FAKE_COMPILER = """\
import sys, pathlib, json
args = sys.argv[1:]
out = next(a for a in args if a.startswith('/out:'))[5:]
pathlib.Path(out + '.args.json').write_text(json.dumps(args))
if 'FAIL' in pathlib.Path(args[-1]).read_text():
    print('error CS1002: ; expected'); sys.exit(1)
pathlib.Path(out).write_bytes(b'MZ fake dll')
"""


@pytest.fixture
def env(tmp_path, monkeypatch):
    program, mods, game = tmp_path / "COI-Planner", tmp_path / "Mods", tmp_path / "game"
    src = program / "Exporter" / "source"
    src.mkdir(parents=True)
    (src / "PlannerDataExporter.cs").write_text("class X {}")
    (src / "manifest.json").write_text(json.dumps({"id": "PlannerDataExporter", "version": "0.1.2"}))
    (src / "LICENSE-THIRD-PARTY").write_text("MIT")
    (src / "summarize.py").write_text("# summarizer")
    (program / "Data").mkdir()
    managed = game / "Captain of Industry_Data" / "Managed"
    managed.mkdir(parents=True)
    for n in ("mscorlib", "System", "System.Core", "netstandard", "Mafi", "Mafi.Core"):
        (managed / f"{n}.dll").write_bytes(b"game " + n.encode())
    fake = tmp_path / "fakecsc.py"
    fake.write_text(FAKE_COMPILER)
    monkeypatch.setenv("COI_MODS_DIR", str(mods))
    monkeypatch.setenv("COI_ROOT", str(game))
    api = planner_api.PlannerApi(program)
    monkeypatch.setattr(api, "_compilers", lambda: [("fake modern", [sys.executable, str(fake)], True)])
    api._fake_compiler, api._game = fake, game
    return program, mods, api


def test_state_before_build(env):
    program, mods, api = env
    s = api.state()
    assert s["canBuild"] and not s["built"] and not s["installed"] and s["gameDir"] == str(api._game) and s["compiler"] == "fake modern"


def test_build_compiles_against_the_game_with_the_right_arguments(env):
    program, mods, api = env
    r = api.build_exporter()
    assert r["ok"] and r["compiler"] == "fake modern"
    out = program / "Data" / "exporter-build" / "PlannerDataExporter"
    assert (out / "PlannerDataExporter.dll").is_file() and (out / "manifest.json").is_file() and (out / "summarize.py").is_file()
    args = json.loads((out / "PlannerDataExporter.dll.args.json").read_text())
    managed = api._game / "Captain of Industry_Data" / "Managed"
    assert "/target:library" in args and "/nostdlib+" in args and "/langversion:latest" in args
    assert f"/reference:{managed / 'Mafi.Core.dll'}" in args and f"/reference:{managed / 'mscorlib.dll'}" in args
    assert args[-1].endswith("PlannerDataExporter.cs")
    s = api.state()
    assert s["built"] and s["builtVersion"] == "0.1.2" and not s["needsRebuild"]


def test_game_update_is_noticed(env):
    program, mods, api = env
    api.build_exporter()
    (api._game / "Captain of Industry_Data" / "Managed" / "Mafi.Core.dll").write_bytes(b"a much newer game library")
    assert api.state()["needsRebuild"]
    api.build_exporter()
    assert not api.state()["needsRebuild"]


def test_compile_error_returns_the_log_and_leaves_nothing_half_built(env):
    program, mods, api = env
    (program / "Exporter" / "source" / "PlannerDataExporter.cs").write_text("FAIL")
    r = api.build_exporter()
    assert not r["ok"] and "CS1002" in r["log"] and not api.state()["built"]
    assert api.install_exporter()["error"] == "Build the exporter first."


def test_falls_back_to_the_next_compiler(env, monkeypatch):
    program, mods, api = env
    (api._fake_compiler.parent / "broken.py").write_text("import sys; print('boom'); sys.exit(2)")
    monkeypatch.setattr(api, "_compilers", lambda: [("broken", [sys.executable, str(api._fake_compiler.parent / "broken.py")], True),
                                                    ("old windows", [sys.executable, str(api._fake_compiler)], False)])
    r = api.build_exporter()
    assert r["ok"] and r["compiler"] == "old windows" and "boom" in r["log"]
    args = json.loads((program / "Data" / "exporter-build" / "PlannerDataExporter" / "PlannerDataExporter.dll.args.json").read_text())
    assert "/langversion:latest" not in args                       # the old compiler does not know it


def test_no_game_asks_for_the_folder(env, monkeypatch):
    program, mods, api = env
    monkeypatch.delenv("COI_ROOT")
    monkeypatch.setattr(planner_api, "_steam_libraries", lambda: [])
    r = api.build_exporter()
    assert not r["ok"] and r["needFolder"]


def test_no_compiler_explains(env, monkeypatch):
    program, mods, api = env
    monkeypatch.setattr(api, "_compilers", lambda: [])
    assert "No C# compiler" in api.build_exporter()["error"]


def test_install_uses_the_name_the_game_requires(env):
    program, mods, api = env
    r = api.build_and_install()
    assert r["ok"] and (mods / "PlannerDataExporter" / "manifest.json").is_file() and (mods / "PlannerDataExporter" / "PlannerDataExporter.dll").is_file()
    assert not (mods / "PlannerDataExporter" / "PlannerDataExporter").exists()      # not nested twice
    assert api.state()["installed"]


def test_update_keeps_exports_and_uninstall_removes_everything(env):
    program, mods, api = env
    api.build_and_install()
    exp = mods / "PlannerDataExporter" / "exports"
    exp.mkdir()
    (exp / "planner-data-1.json").write_text("{}")
    (program / "Exporter" / "source" / "manifest.json").write_text(json.dumps({"version": "0.1.3"}))
    assert api.build_and_install()["ok"]
    assert (exp / "planner-data-1.json").exists()                           # an update never deletes exports
    assert api.state()["installedVersion"] == "0.1.3"
    assert api.uninstall_exporter()["ok"] and not (mods / "PlannerDataExporter").exists()
    assert api.uninstall_exporter()["ok"]                                   # already gone is fine


def test_missing_source_explains(env):
    program, mods, api = env
    import shutil
    shutil.rmtree(program / "Exporter")
    assert "source is not part" in api.build_exporter()["error"] and not api.state()["canBuild"]


def test_summarize_latest_writes_a_small_summary(env):
    program, mods, api = env
    api.build_and_install()
    exp = mods / "PlannerDataExporter" / "exports"
    exp.mkdir()
    pkg = {"schemaVersion": 1, "exporter": "x", "gameVersion": "0.8.7d", "protoCount": 1,
           "protos": {"T": [{"id": "A", "name": "A", "data": {"Layout": {"Size": [1, 2], "Blob": list(range(50000))}}}]}, "errors": []}
    (exp / "planner-data-20261112-120000.json").write_text(json.dumps(pkg))
    r = api.summarize_latest()
    assert r["ok"] and r["types"] == 1 and r["bytes"] < 20000
    assert json.loads(api.read_summary()["text"])["gameVersion"] == "0.8.7d"
    assert api.state()["summary"]["exists"]


def test_summarize_without_exports_explains(env):
    program, mods, api = env
    assert "No export" in api.summarize_latest()["error"]


def test_page_cannot_reach_private_helpers(env):
    program, mods, api = env
    public = [n for n in dir(api) if not n.startswith("_")]
    assert set(public) == {"state", "build_exporter", "install_exporter", "build_and_install", "pick_game_folder", "uninstall_exporter",
                           "summarize_latest", "read_summary", "open_exports_folder", "open_data_folder", "save_text"}


def test_entry_point_check_reports_missing_page(tmp_path, monkeypatch, capsys):
    import importlib
    sys.path.insert(0, str(ROOT / "desktop"))
    mod = importlib.import_module("coi_planner")
    monkeypatch.setattr(mod, "PAGE", tmp_path / "nope.html")
    assert mod.check() == 1 and "page is missing" in capsys.readouterr().out




MONO = Path("/usr/lib/mono/4.5")


@pytest.mark.skipif(not (shutil_which := __import__("shutil").which("mcs")) or not (MONO / "mscorlib.dll").exists(),
                    reason="needs Mono's C# compiler")
def test_real_compiler_accepts_the_exact_command_line(tmp_path, monkeypatch):
    """The real exporter source, compiled with the exact argument list the planner uses, against stand-in game libraries."""
    import shutil, subprocess
    game = tmp_path / "game"
    managed = game / "Captain of Industry_Data" / "Managed"
    managed.mkdir(parents=True)
    for n in ("mscorlib", "System", "System.Core"):
        shutil.copy2(MONO / f"{n}.dll", managed / f"{n}.dll")
    subprocess.run(["mcs", "-target:library", f"-out:{managed / 'Mafi.Core.dll'}", str(ROOT / "tools" / "exporter" / "stubs" / "GameStubs.cs")],
                   check=True, capture_output=True)
    program = tmp_path / "prog"
    src = program / "Exporter" / "source"
    src.mkdir(parents=True)
    for n in planner_api.SOURCE_FILES:
        shutil.copy2(ROOT / "tools" / "exporter" / n, src / n)
    (program / "Data").mkdir()
    monkeypatch.setenv("COI_ROOT", str(game))
    monkeypatch.setenv("COI_MODS_DIR", str(tmp_path / "Mods"))
    api = planner_api.PlannerApi(program)
    monkeypatch.setattr(api, "_compilers", lambda: [("mono", ["mcs"], False)])
    r = api.build_and_install()
    assert r["ok"], r.get("log")
    assert (tmp_path / "Mods" / "PlannerDataExporter" / "PlannerDataExporter.dll").stat().st_size > 5000


def test_packaging_layout(tmp_path):
    """The folder the build assembles: launcher, app.json for PocketApps, the page, the backend, the mod's source."""
    sys.path.insert(0, str(ROOT / "packaging"))
    import build_embedded
    ui = tmp_path / "ui.html"; ui.write_text("<html></html>")
    out = tmp_path / "dist" / "COI-Planner"
    assert build_embedded.main(["--out", str(out), "--ui", str(ui), "--version", "0.2.0", "--layout-only"]) == 0
    names = {p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()}
    assert {"COI-Planner.cmd", "COI-Planner-Browser.cmd", "README.txt", "app.json", "app/COI-Planner.html", "app/coi_planner.py",
            "app/planner_api.py", "app/summarize.py", "Data/README.txt"} <= names
    assert {f"Exporter/source/{n}" for n in planner_api.SOURCE_FILES} <= names          # what the in-app build compiles
    assert not any(n.startswith("Exporter/PlannerDataExporter") for n in names)          # no prebuilt mod: it is built per PC
    meta = json.loads((out / "app.json").read_text())
    assert meta["exe"] == "python/pythonw.exe" and meta["args"] == ["app/coi_planner.py"] and meta["version"] == "v0.2.0" and meta["data"] == ["Data"]
    assert b"pythonw.exe" in (out / "COI-Planner.cmd").read_bytes() and b"\r\n" in (out / "COI-Planner.cmd").read_bytes()
    assert build_embedded.pth_lines("312")[-1] == "..\\app"
    assert build_embedded.embed_candidates("3.12.10")[0] == "3.12.10"


def test_recipe_in_the_repo_is_valid_for_pocketbuilder():
    r = json.loads((ROOT / "pocketbuilder.json").read_text())
    assert r["name"] == "COI-Planner" and r["release"]["tag"] == "v{version}" and r["artifacts"] == ["dist/COI-Planner-Portable-v{version}.zip"]
    assert "dotnet" not in r["requires"] and not any("build.ps1" in str(b) for b in r["build"])          # the compile happens on the user's PC
    assert any("build_embedded.py" in str(b) for b in r["build"])
