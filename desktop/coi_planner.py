"""COI Planner as a program window: Edge WebView2 (through pywebview) around the planner page.

    pythonw.exe app\\coi_planner.py             opens the window
    python.exe  app\\coi_planner.py --check     checks the packaging without opening a window (the build runs this)

Everything the program keeps (the page's saved data, backups) is under <program folder>\\Data, so the folder can be
carried to another PC. If the window cannot be created (WebView2 missing, library problem) the planner opens in
Edge/Chrome instead, so it never just fails to start.
"""
import os
import subprocess
import sys
import traceback
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
ROOT = APP_DIR.parent                      # python/, app/, Exporter/, Data/
PAGE = APP_DIR / "COI-Planner.html"
TITLE = "COI Planner"


def _prepare_environment() -> None:
    # pythonnet (the Windows window) must find the embedded runtime's python3xx.dll
    dll = Path(sys.base_prefix) / f"python{sys.version_info.major}{sys.version_info.minor}.dll"
    if dll.exists():
        os.environ.setdefault("PYTHONNET_PYDLL", str(dll))
    (ROOT / "Data" / "webview").mkdir(parents=True, exist_ok=True)


def open_in_browser() -> int:
    """Fallback: the browser launcher shipped in the same folder (own Edge/Chrome window, data in Data\\browser)."""
    launcher = ROOT / "COI-Planner-Browser.cmd"
    try:
        if launcher.exists() and os.name == "nt":
            subprocess.Popen(["cmd", "/c", str(launcher)], creationflags=0x08000000)    # no console window
        else:
            import webbrowser
            webbrowser.open(PAGE.as_uri())
    except OSError:
        return 1
    return 0


def check() -> int:
    """Packaging self-test: 0 if the program can start (the window library imports and the page is there)."""
    print(f"COI Planner check: Python {sys.version.split()[0]}, folder {ROOT}")
    if not PAGE.exists():
        print("FAILED: the planner page is missing:", PAGE)
        return 1
    sys.path.insert(0, str(APP_DIR))
    try:
        import planner_api  # noqa: F401
        import summarize    # noqa: F401
        print("backend modules: OK")
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        print("FAILED: backend modules")
        return 1
    _prepare_environment()
    try:
        import webview
        print("pywebview", getattr(webview, "__version__", "?"), "imported: OK")
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        print("FAILED: pywebview cannot be imported")
        return 1
    try:                                                    # the Windows window backend: pythonnet + WebView2 libraries
        from webview.platforms import winforms  # noqa: F401
        print("window backend (WinForms + WebView2): OK")
    except Exception as e:  # noqa: BLE001
        print(f"window backend: NOT AVAILABLE ({e!r}); the planner will open in the browser instead.")
    return 0


def main(argv) -> int:
    if "--check" in argv:
        return check()
    sys.path.insert(0, str(APP_DIR))
    _prepare_environment()
    try:
        import webview
        from planner_api import PlannerApi
        holder = {}
        api = PlannerApi(ROOT, lambda: holder.get("window"))
        holder["window"] = webview.create_window(TITLE, url=str(PAGE), js_api=api, width=1280, height=860,
                                                 min_size=(900, 600), text_select=True)
        webview.start(storage_path=str(ROOT / "Data" / "webview"), private_mode=False)
        return 0
    except Exception:  # noqa: BLE001
        (ROOT / "Data").mkdir(exist_ok=True)
        (ROOT / "Data" / "last-error.txt").write_text(traceback.format_exc(), encoding="utf-8")
        return open_in_browser()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
