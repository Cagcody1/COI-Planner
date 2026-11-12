"""Backend of the COI Planner window: what a web page cannot do on its own.

Installs / removes the game-data exporter mod, lists and summarizes its exports, opens folders, saves files. The window
(coi_planner.py) hands an instance of PlannerApi to the page, which calls these methods as window.pywebview.api.<name>().
Only fixed locations are ever touched: the game's Mods\\PlannerDataExporter folder, its exports, and files the user picks
in a save dialog. No path from the page is used to read, copy or delete anything.
"""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

MOD_NAME = "PlannerDataExporter"


def mods_dir() -> Path:
    """The game's Mods folder (COI_MODS_DIR overrides it, for tests and unusual installs)."""
    env = os.environ.get("COI_MODS_DIR")
    if env:
        return Path(env)
    return Path(os.environ.get("APPDATA") or Path.home()) / "Captain of Industry" / "Mods"


def _manifest_version(folder: Path):
    try:
        return json.loads((folder / "manifest.json").read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError):
        return None


class PlannerApi:
    def __init__(self, root, window_getter=None):
        self._root = Path(root)                     # the program folder: python/, app/, Exporter/, Data/
        self._window = window_getter or (lambda: None)

    # -- locations (private: not callable from the page) -------------------------------------------------------
    @property
    def _bundled(self) -> Path:
        return self._root / "Exporter" / MOD_NAME

    @property
    def _installed(self) -> Path:
        return mods_dir() / MOD_NAME

    @property
    def _exports(self) -> Path:
        return self._installed / "exports"

    # -- state -------------------------------------------------------------------------------------------------
    def state(self) -> dict:
        exports = []
        if self._exports.is_dir():
            for f in sorted(self._exports.glob("planner-data-*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                st = f.stat()
                exports.append({"name": f.name, "bytes": st.st_size, "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime))})
        summary = self._exports / "planner-export-summary.json"
        return {
            "native": True,
            "dataDir": str(self._root / "Data"),
            "modsDir": str(mods_dir()),
            "modsDirExists": mods_dir().is_dir(),
            "bundled": (self._bundled / "manifest.json").is_file(),
            "bundledVersion": _manifest_version(self._bundled),
            "installed": (self._installed / "manifest.json").is_file(),
            "installedVersion": _manifest_version(self._installed),
            "exports": exports,
            "summary": {"exists": summary.is_file(), "bytes": summary.stat().st_size if summary.is_file() else 0},
        }

    # -- the mod -----------------------------------------------------------------------------------------------
    def install_exporter(self) -> dict:
        if not (self._bundled / "manifest.json").is_file():
            return {"ok": False, "error": "The exporter is not part of this copy. It is only included when the planner is built on a PC that has the game installed."}
        try:
            mods_dir().mkdir(parents=True, exist_ok=True)
            # copies over an existing install (an update): its exports folder is never touched
            shutil.copytree(self._bundled, self._installed, dirs_exist_ok=True)
        except OSError as e:
            return {"ok": False, "error": f"Copying failed ({e}). Close the game and try again."}
        return {"ok": True, "state": self.state()}

    def uninstall_exporter(self) -> dict:
        if not self._installed.exists():
            return {"ok": True, "state": self.state()}
        try:
            shutil.rmtree(self._installed)
        except OSError as e:
            return {"ok": False, "error": f"Could not delete everything ({e}). Close the game and try again."}
        return {"ok": True, "state": self.state()}

    # -- exports -----------------------------------------------------------------------------------------------
    def summarize_latest(self) -> dict:
        files = sorted(self._exports.glob("planner-data-*.json"), key=lambda p: p.stat().st_mtime, reverse=True) if self._exports.is_dir() else []
        if not files:
            return {"ok": False, "error": "No export found yet. Install the exporter, start the game with it enabled and start a NEW map."}
        import summarize                              # tools/exporter/summarize.py, copied next to this file when packaged
        try:
            s = summarize.summarize(str(files[0]))
        except (OSError, ValueError, json.JSONDecodeError) as e:
            return {"ok": False, "error": f"Could not read {files[0].name}: {e}"}
        out = self._exports / "planner-export-summary.json"
        text = json.dumps(s, indent=1)
        out.write_text(text, encoding="utf-8")
        return {"ok": True, "source": files[0].name, "path": str(out), "bytes": len(text.encode("utf-8")),
                "types": len(s["types"]), "prototypes": sum(t["count"] for t in s["types"].values())}

    def read_summary(self) -> dict:
        """The text of the summary, to copy into a message (refuses anything over 3 MB)."""
        f = self._exports / "planner-export-summary.json"
        if not f.is_file():
            return {"ok": False, "error": "Make the summary first."}
        if f.stat().st_size > 3_000_000:
            return {"ok": False, "error": "The summary is over 3 MB; attach the file instead.", "path": str(f)}
        return {"ok": True, "text": f.read_text(encoding="utf-8"), "path": str(f)}

    # -- folders and files -------------------------------------------------------------------------------------
    def open_exports_folder(self) -> dict:
        return self._open(self._exports)

    def open_data_folder(self) -> dict:
        return self._open(self._root / "Data")

    def _open(self, folder: Path) -> dict:
        if not folder.is_dir():
            return {"ok": False, "error": f"{folder} does not exist yet."}
        try:
            if sys.platform.startswith("win"):
                os.startfile(str(folder))             # noqa: S606 - a fixed folder, opened in Explorer
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(folder)])
            else:
                subprocess.Popen(["xdg-open", str(folder)])
        except OSError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True}

    def save_text(self, filename: str, text: str) -> dict:
        """Save-as dialog, then write `text` (used for backups and the summary, where a browser download would not work)."""
        import webview
        win = self._window()
        if win is None:
            return {"ok": False, "error": "No window."}
        picked = win.create_file_dialog(webview.SAVE_DIALOG, save_filename=os.path.basename(filename))
        if not picked:
            return {"ok": False, "cancelled": True}
        path = picked if isinstance(picked, str) else picked[0]
        try:
            Path(path).write_text(text, encoding="utf-8")
        except OSError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "path": str(path)}
