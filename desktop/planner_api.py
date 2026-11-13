"""Backend of the COI Planner window: what a web page cannot do on its own.

Installs / removes the game-data exporter mod, lists and summarizes its exports, opens folders, saves files. The window
(coi_planner.py) hands an instance of PlannerApi to the page, which calls these methods as window.pywebview.api.<name>().
Only fixed locations are ever touched: the game's Mods\\PlannerDataExporter folder, its exports, and files the user picks
in a save dialog. No path from the page is used to read, copy or delete anything.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

MOD_NAME = "PlannerDataExporter"
SOURCE_FILES = ("PlannerDataExporter.cs", "manifest.json", "LICENSE-THIRD-PARTY", "summarize.py")   # shipped in Exporter\\source
COPY_TO_MOD = ("manifest.json", "LICENSE-THIRD-PARTY", "summarize.py")
GAME_REFS = ("mscorlib", "System", "System.Core", "netstandard", "Mafi", "Mafi.Core")   # the game's own libraries the mod compiles against
MANAGED = Path("Captain of Industry_Data") / "Managed"


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


def _read_json(path: Path) -> dict:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _steam_libraries() -> list:
    """Steam library folders (from the registry and libraryfolders.vdf); empty off Windows or without Steam."""
    roots = []
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
            roots.append(Path(winreg.QueryValueEx(k, "SteamPath")[0]))
    except (ImportError, OSError):
        pass
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        if base:
            roots.append(Path(base) / "Steam")
    libs = []
    for r in roots:
        libs.append(r)
        vdf = r / "steamapps" / "libraryfolders.vdf"
        try:
            for m in re.finditer(r'"path"\s+"([^"]+)"', vdf.read_text(encoding="utf-8", errors="replace")):
                libs.append(Path(m.group(1).replace("\\\\", "\\")))
        except OSError:
            pass
    return libs


def _is_game(folder) -> bool:
    return bool(folder) and (Path(folder) / MANAGED / "Mafi.Core.dll").is_file()


def _dialog(webview, kind: str):
    """pywebview 6 has webview.FileDialog.SAVE / .FOLDER; older versions have SAVE_DIALOG / FOLDER_DIALOG."""
    enum = getattr(webview, "FileDialog", None)
    return getattr(enum, kind) if enum is not None and hasattr(enum, kind) else getattr(webview, kind + "_DIALOG")


def _dll_stamp(game: Path) -> dict:
    st = (game / MANAGED / "Mafi.Core.dll").stat()
    return {"size": st.st_size, "mtime": int(st.st_mtime)}


class PlannerApi:
    def __init__(self, root, window_getter=None):
        self._root = Path(root)                     # the program folder: python/, app/, Exporter/, Data/
        self._window = window_getter or (lambda: None)

    # -- locations (private: not callable from the page) -------------------------------------------------------
    @property
    def _source(self) -> Path:                      # the mod's C# source, shipped with the program
        return self._root / "Exporter" / "source"

    @property
    def _built(self) -> Path:                       # where the mod is compiled to (inside Data: portable, survives updates)
        return self._root / "Data" / "exporter-build" / MOD_NAME

    @property
    def _installed(self) -> Path:
        return mods_dir() / MOD_NAME

    @property
    def _exports(self) -> Path:
        return self._installed / "exports"

    @property
    def _settings_file(self) -> Path:
        return self._root / "Data" / "settings.json"

    # -- the game and the compiler -----------------------------------------------------------------------------
    def _find_game(self):
        cands = []
        saved = _read_json(self._settings_file).get("gameDir")
        if saved:
            cands.append(Path(saved))
        if os.environ.get("COI_ROOT"):
            cands.append(Path(os.environ["COI_ROOT"]))
        cands += [lib / "steamapps" / "common" / "Captain of Industry" for lib in _steam_libraries()]
        for c in cands:
            if _is_game(c):
                return c
        return None

    def _compilers(self) -> list:
        """C# compilers, best first: the .NET SDK's (PocketBuilder's own portable copy counts), then the one Windows
        ships with (.NET Framework, C# 5: the mod's source is written to compile with it). -> [(label, argv prefix, modern)]"""
        out = []
        dotnets = [shutil.which("dotnet")]
        for rel in (("..", "PocketBuilder", "tools", "dotnet", "dotnet.exe"), ("..", "..", "Apps", "PocketBuilder", "tools", "dotnet", "dotnet.exe")):
            dotnets.append(str(self._root.joinpath(*rel)))
        for d in dotnets:
            if d and Path(d).is_file():
                cscs = sorted((Path(d).parent / "sdk").glob("*/Roslyn/bincore/csc.dll"), reverse=True)
                if cscs:
                    out.append((".NET SDK compiler", [d, str(cscs[0])], True))
                    break
        win = os.environ.get("WINDIR") or os.environ.get("SystemRoot")
        if win:
            for fw in ("Framework64", "Framework"):
                exe = Path(win) / "Microsoft.NET" / fw / "v4.0.30319" / "csc.exe"
                if exe.is_file():
                    out.append((f"Windows .NET Framework compiler", [str(exe)], False))
                    break
        return out

    # -- state -------------------------------------------------------------------------------------------------
    def state(self) -> dict:
        exports = []
        if self._exports.is_dir():
            for f in sorted(self._exports.glob("planner-data-*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                st = f.stat()
                exports.append({"name": f.name, "bytes": st.st_size, "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime))})
        summary = self._exports / "planner-export-summary.json"
        game = self._find_game()
        built_info = _read_json(self._built.parent / "built.json")
        built = (self._built / f"{MOD_NAME}.dll").is_file()
        needs_rebuild = bool(built and game and built_info.get("stamp") != _dll_stamp(game))
        return {
            "native": True,
            "dataDir": str(self._root / "Data"),
            "modsDir": str(mods_dir()),
            "modsDirExists": mods_dir().is_dir(),
            "gameDir": str(game) if game else None,
            "canBuild": (self._source / "PlannerDataExporter.cs").is_file(),
            "compiler": (self._compilers() or [("none",)])[0][0],
            "built": built,
            "builtVersion": _manifest_version(self._built) if built else None,
            "needsRebuild": needs_rebuild,
            "installed": (self._installed / "manifest.json").is_file(),
            "installedVersion": _manifest_version(self._installed),
            "exports": exports,
            "summary": {"exists": summary.is_file(), "bytes": summary.stat().st_size if summary.is_file() else 0},
        }

    # -- building and installing the mod -------------------------------------------------------------------------
    def build_exporter(self) -> dict:
        """Compiles the mod's source against THIS PC's game, so it always matches the installed game version."""
        src = self._source
        if not (src / "PlannerDataExporter.cs").is_file():
            return {"ok": False, "error": "The exporter's source is not part of this copy of the planner."}
        game = self._find_game()
        if game is None:
            return {"ok": False, "needFolder": True, "error": "Could not find the game. Choose its folder (the one that contains \"Captain of Industry_Data\")."}
        managed = game / MANAGED
        refs = [managed / f"{n}.dll" for n in GAME_REFS if (managed / f"{n}.dll").is_file()]
        if not any(r.name == "mscorlib.dll" for r in refs):
            return {"ok": False, "error": f"The game folder looks incomplete: mscorlib.dll is missing from {managed}."}
        compilers = self._compilers()
        if not compilers:
            return {"ok": False, "error": "No C# compiler was found. Windows normally has one (.NET Framework 4); otherwise install the .NET SDK."}
        out = self._built
        if out.parent.exists():
            shutil.rmtree(out.parent, ignore_errors=True)
        out.mkdir(parents=True)
        dll = out / f"{MOD_NAME}.dll"
        log = []
        used = None
        for label, prefix, modern in compilers:
            cmd = prefix + ["/nologo", "/noconfig", "/target:library", "/nostdlib+", f"/out:{dll}"] + (["/langversion:latest"] if modern else []) \
                + [f"/reference:{r}" for r in refs] + [str(src / "PlannerDataExporter.cs")]
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=180, cwd=str(out),
                                   creationflags=0x08000000 if os.name == "nt" else 0)    # no console window
            except (OSError, subprocess.TimeoutExpired) as e:
                log.append(f"[{label}] could not run: {e}")
                continue
            text = (r.stdout + r.stderr).strip()
            log.append(f"[{label}] exit {r.returncode}" + (("\n" + text) if text else ""))
            if r.returncode == 0 and dll.is_file():
                used = label
                break
        if used is None:
            shutil.rmtree(out.parent, ignore_errors=True)
            return {"ok": False, "error": "The compiler rejected the exporter (the game may have changed). Send the log below.", "log": "\n".join(log)}
        for name in COPY_TO_MOD:
            if (src / name).is_file():
                shutil.copy2(src / name, out / name)
        (out.parent / "built.json").write_text(json.dumps({
            "gameDir": str(game), "stamp": _dll_stamp(game), "builtAt": time.strftime("%Y-%m-%d %H:%M"), "compiler": used,
            "version": _manifest_version(out)}), encoding="utf-8")
        return {"ok": True, "compiler": used, "log": "\n".join(log), "state": self.state()}

    def install_exporter(self) -> dict:
        """Copies the built mod into the game's Mods folder (an update keeps its exports folder)."""
        if not (self._built / "manifest.json").is_file():
            return {"ok": False, "error": "Build the exporter first."}
        try:
            mods_dir().mkdir(parents=True, exist_ok=True)
            shutil.copytree(self._built, self._installed, dirs_exist_ok=True)
        except OSError as e:
            return {"ok": False, "error": f"Copying failed ({e}). Close the game and try again."}
        return {"ok": True, "state": self.state()}

    def build_and_install(self) -> dict:
        r = self.build_exporter()
        if not r.get("ok"):
            return r
        i = self.install_exporter()
        if i.get("ok"):
            i["compiler"], i["log"] = r.get("compiler"), r.get("log")
        return i

    def pick_game_folder(self) -> dict:
        import webview
        win = self._window()
        if win is None:
            return {"ok": False, "error": "No window."}
        picked = win.create_file_dialog(_dialog(webview, "FOLDER"))
        if not picked:
            return {"ok": False, "cancelled": True}
        folder = Path(picked if isinstance(picked, str) else picked[0])
        if not _is_game(folder):
            return {"ok": False, "error": f"That folder does not contain {MANAGED}\\Mafi.Core.dll. Choose the game folder itself (it contains \"Captain of Industry_Data\")."}
        (self._root / "Data").mkdir(exist_ok=True)
        settings = _read_json(self._settings_file)
        settings["gameDir"] = str(folder)
        self._settings_file.write_text(json.dumps(settings), encoding="utf-8")
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

    def read_blueprint_api(self) -> dict:
        """The game's blueprint classes and methods as listed by the exporter (blueprint-api.json), to copy into a message."""
        f = self._exports / "blueprint-api.json"
        if not f.is_file():
            return {"ok": False, "error": "Not written yet. Rebuild the exporter, then start the game with it enabled and start a map."}
        if f.stat().st_size > 3_000_000:
            return {"ok": False, "error": "The file is over 3 MB; attach it instead.", "path": str(f)}
        return {"ok": True, "text": f.read_text(encoding="utf-8"), "path": str(f), "bytes": f.stat().st_size}

    def read_latest_export(self) -> dict:
        """The text of the newest export, for the planner to import (refuses anything over 200 MB)."""
        files = sorted(self._exports.glob("planner-data-*.json"), key=lambda p: p.stat().st_mtime, reverse=True) if self._exports.is_dir() else []
        if not files:
            return {"ok": False, "error": "No export found yet. Install the exporter, start the game with it enabled and start a NEW map."}
        if files[0].stat().st_size > 200_000_000:
            return {"ok": False, "error": f"{files[0].name} is too large to import. Rebuild the exporter (newer versions export far less) and export again."}
        try:
            return {"ok": True, "name": files[0].name, "text": files[0].read_text(encoding="utf-8")}
        except OSError as e:
            return {"ok": False, "error": f"Could not read {files[0].name}: {e}"}

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
        picked = win.create_file_dialog(_dialog(webview, "SAVE"), save_filename=os.path.basename(filename))
        if not picked:
            return {"ok": False, "cancelled": True}
        path = picked if isinstance(picked, str) else picked[0]
        try:
            Path(path).write_text(text, encoding="utf-8")
        except OSError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "path": str(path)}
