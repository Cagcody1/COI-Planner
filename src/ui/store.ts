import bundled from "../../data/0.8.1a-b550-Update-4/gamedata.json";
import bundledLines from "../../data/0.8.1a-b550-Update-4/lines.json";
import { validateGameData, type GameData } from "../data/schema";
import type { ProductLine } from "../engine/flexloop";

export type Line = ProductLine & { assemblers: string[] };
export const BUNDLED = bundled as unknown as GameData;
export const LINES = bundledLines as unknown as Line[];

const get = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const set = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
export const pref = { get, set };

/** The player's own imported export wins over the bundled data, if present and valid. */
export function loadActive(): { data: GameData; user: boolean } {
  const u = get<GameData | null>("coi-userdata", null);
  if (u && validateGameData(u).length === 0) return { data: u, user: true };
  return { data: BUNDLED, user: false };
}
export const saveUserData = (d: GameData) => set("coi-userdata", d);
export const clearUserData = () => { try { localStorage.removeItem("coi-userdata"); } catch { /* ignore */ } };

/** After a patch, product lines can break (renamed products, removed machines). Report instead of crashing. */
export function checkLines(data: GameData, lines: Line[]): string[] {
  const prods = new Set(data.products.map((p) => p.id)), machines = new Set(data.machines.map((m) => m.id)), out: string[] = [];
  for (const l of lines) {
    for (const t of l.tiers) if (!prods.has(t.product)) out.push(`${l.name}: product "${t.product}" no longer exists`);
    for (const a of l.assemblers) if (!machines.has(a)) out.push(`${l.name}: assembler ${a} no longer exists`);
  }
  return out;
}
export const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Newest game version the planner is meant for (confirmed by the project owner). Update when the game updates. */
export const CURRENT_GAME = [0, 8, 7] as const;
const parse = (v: string) => (v.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1, 4).map(Number) ?? null);
/** true if `version` is known to be older than CURRENT_GAME; null if it can't be read. */
export function isOlderThanCurrent(version: string): boolean | null {
  const v = parse(version);
  if (!v) return null;
  for (let i = 0; i < 3; i++) if (v[i] !== CURRENT_GAME[i]) return v[i] < CURRENT_GAME[i];
  return false;
}

/** Everything the planner saves in this browser (keys start with "coi-"): imported game data, designs, choices. */
export function exportBackup(): string {
  const items: Record<string, unknown> = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith("coi-")) items[k] = JSON.parse(localStorage.getItem(k)!); } } catch { /* storage blocked */ }
  return JSON.stringify({ coiPlannerBackup: 1, savedAt: new Date().toISOString(), items });
}
/** Restores a backup written by exportBackup. Returns the number of entries restored; throws on a file that isn't a backup. */
export function importBackup(text: string): number {
  const b = JSON.parse(text);
  if (!b || b.coiPlannerBackup !== 1 || typeof b.items !== "object") throw new Error("That file is not a Factory Planner backup.");
  if (b.items["coi-userdata"] && validateGameData(b.items["coi-userdata"]).length) throw new Error("The backup's game data is invalid.");
  let n = 0;
  for (const [k, v] of Object.entries(b.items)) if (k.startsWith("coi-") && set(k, v)) n++;
  return n;
}
