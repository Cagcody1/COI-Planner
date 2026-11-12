// The planner also runs as a native program window (desktop/coi_planner.py, Edge WebView2). There, the page can call a
// small Python backend as window.pywebview.api. In a plain browser none of this exists and the page behaves as before.
export interface NativeState {
  native: true; dataDir: string; modsDir: string; modsDirExists: boolean;
  bundled: boolean; bundledVersion: string | null; installed: boolean; installedVersion: string | null;
  exports: { name: string; bytes: number; modified: string }[]; summary: { exists: boolean; bytes: number };
}
export interface Result { ok: boolean; error?: string; cancelled?: boolean; state?: NativeState; [k: string]: unknown }
export interface NativeApi {
  state(): Promise<NativeState>;
  install_exporter(): Promise<Result>; uninstall_exporter(): Promise<Result>;
  summarize_latest(): Promise<Result>; read_summary(): Promise<Result>;
  open_exports_folder(): Promise<Result>; open_data_folder(): Promise<Result>;
  save_text(filename: string, text: string): Promise<Result>;
}
const get = (): NativeApi | null => ((window as unknown as { pywebview?: { api?: NativeApi } }).pywebview?.api ?? null);

/** Resolves with the backend if this is the native window, else null (after a short wait for the bridge to appear). */
export function whenNative(waitMs = 1500): Promise<NativeApi | null> {
  return new Promise((resolve) => {
    if (get()) return resolve(get());
    const done = () => resolve(get());
    window.addEventListener("pywebviewready", done, { once: true });
    setTimeout(done, waitMs);
  });
}
