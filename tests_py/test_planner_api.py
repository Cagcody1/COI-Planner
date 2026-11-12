import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "desktop"))
sys.path.insert(0, str(ROOT / "tools" / "exporter"))
import planner_api  # noqa: E402


@pytest.fixture
def env(tmp_path, monkeypatch):
    program, mods = tmp_path / "COI-Planner", tmp_path / "Mods"
    mod = program / "Exporter" / "PlannerDataExporter"
    mod.mkdir(parents=True)
    (mod / "manifest.json").write_text(json.dumps({"id": "PlannerDataExporter", "version": "0.1.2"}))
    (mod / "PlannerDataExporter.dll").write_bytes(b"dll")
    (program / "Data").mkdir()
    monkeypatch.setenv("COI_MODS_DIR", str(mods))
    return program, mods, planner_api.PlannerApi(program)


def test_state_before_install(env):
    program, mods, api = env
    s = api.state()
    assert s["bundled"] and s["bundledVersion"] == "0.1.2" and not s["installed"] and s["exports"] == []


def test_install_uses_the_name_the_game_requires_and_creates_mods(env):
    program, mods, api = env
    assert api.install_exporter()["ok"]
    assert (mods / "PlannerDataExporter" / "manifest.json").is_file()      # folder name == mod id, not nested twice
    assert not (mods / "PlannerDataExporter" / "PlannerDataExporter").exists()
    assert api.state()["installed"]


def test_update_keeps_exports_and_uninstall_removes_everything(env):
    program, mods, api = env
    api.install_exporter()
    exp = mods / "PlannerDataExporter" / "exports"
    exp.mkdir()
    (exp / "planner-data-1.json").write_text("{}")
    (program / "Exporter" / "PlannerDataExporter" / "manifest.json").write_text(json.dumps({"version": "0.1.3"}))
    assert api.install_exporter()["ok"]
    assert (exp / "planner-data-1.json").exists()                           # an update never deletes exports
    assert api.state()["installedVersion"] == "0.1.3"
    assert api.uninstall_exporter()["ok"] and not (mods / "PlannerDataExporter").exists()
    assert api.uninstall_exporter()["ok"]                                   # already gone is fine


def test_install_without_bundled_mod_explains(env):
    program, mods, api = env
    import shutil
    shutil.rmtree(program / "Exporter")
    r = api.install_exporter()
    assert not r["ok"] and "built on a PC that has the game" in r["error"] and not mods.exists()


def test_summarize_latest_writes_a_small_summary(env):
    program, mods, api = env
    api.install_exporter()
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
    assert set(public) == {"state", "install_exporter", "uninstall_exporter", "summarize_latest", "read_summary",
                           "open_exports_folder", "open_data_folder", "save_text"}


def test_entry_point_check_reports_missing_page(tmp_path, monkeypatch, capsys):
    import importlib
    sys.path.insert(0, str(ROOT / "desktop"))
    mod = importlib.import_module("coi_planner")
    monkeypatch.setattr(mod, "PAGE", tmp_path / "nope.html")
    assert mod.check() == 1 and "page is missing" in capsys.readouterr().out


def test_packaging_layout(tmp_path):
    """The folder the build assembles: launcher, app.json for PocketApps, the page, the backend, the mod."""
    sys.path.insert(0, str(ROOT / "packaging"))
    import build_embedded
    ui = tmp_path / "ui.html"; ui.write_text("<html></html>")
    mod = tmp_path / "mod"; mod.mkdir(); (mod / "manifest.json").write_text('{"version":"0.1.3"}'); (mod / "PlannerDataExporter.dll").write_bytes(b"x")
    out = tmp_path / "dist" / "COI-Planner"
    assert build_embedded.main(["--out", str(out), "--ui", str(ui), "--exporter", str(mod), "--version", "0.2.0", "--layout-only"]) == 0
    names = {p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()}
    assert {"COI-Planner.cmd", "COI-Planner-Browser.cmd", "Exporter-Tools.cmd", "README.txt", "app.json", "app/COI-Planner.html",
            "app/coi_planner.py", "app/planner_api.py", "app/summarize.py", "Data/README.txt",
            "Exporter/PlannerDataExporter/manifest.json", "Exporter/PlannerDataExporter/PlannerDataExporter.dll"} <= names
    meta = json.loads((out / "app.json").read_text())
    assert meta["exe"] == "python/pythonw.exe" and meta["args"] == ["app/coi_planner.py"] and meta["version"] == "v0.2.0" and meta["data"] == ["Data"]
    assert b"pythonw.exe" in (out / "COI-Planner.cmd").read_bytes() and b"\r\n" in (out / "COI-Planner.cmd").read_bytes()
    # without a built mod the package still assembles, and says so
    out2 = tmp_path / "dist2"
    assert build_embedded.main(["--out", str(out2), "--ui", str(ui), "--exporter", str(tmp_path / "nothing"), "--layout-only"]) == 0
    assert not (out2 / "Exporter").exists()
    # the embedded interpreter's path file: no user site, the app folder is importable
    assert build_embedded.pth_lines("312")[-1] == "..\\app"
    assert build_embedded.embed_candidates("3.12.10")[0] == "3.12.10"
