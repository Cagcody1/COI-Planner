// Tile geometry for the layout view. World coordinates: x east, y north (as in the game's port data), one unit = one tile.
// A placement's (x, y) is the south-west tile of the machine's footprint; rot = number of 90° counter-clockwise turns.
import type { Machine, Port } from "../data/schema";

export interface Placed { id: string; machineId: string; x: number; y: number; rot: number }
export interface WPort extends Port { wx: number; wy: number }      // port tile in world coordinates (dir is rotated too)

const ORDER = ["E", "N", "W", "S"] as const;
const VEC: Record<string, [number, number]> = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] };

export function sizeOf(m: Machine, rot: number) {
  const f = m.footprint ?? { w: 1, h: 1 };
  return rot % 2 ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
}
/** A port after `rot` counter-clockwise quarter turns of a w×h footprint. */
export function rotatePort(p: Port, w: number, h: number, rot: number): Port {
  let x = p.x, y = p.y, d = ORDER.indexOf(p.dir), cw = w, ch = h;
  for (let k = 0; k < ((rot % 4) + 4) % 4; k++) { [x, y] = [ch - 1 - y, x]; [cw, ch] = [ch, cw]; d = (d + 1) % 4; }
  return { ...p, x, y, dir: ORDER[d] };
}
export function worldPorts(m: Machine, pl: Placed): WPort[] {
  const f = m.footprint ?? { w: 1, h: 1 };
  return (m.ports ?? []).map((p) => { const r = rotatePort(p, f.w, f.h, pl.rot); return { ...r, wx: pl.x + r.x, wy: pl.y + r.y }; });
}
export function rectOf(m: Machine, pl: Placed) {
  const s = sizeOf(m, pl.rot);
  return { x0: pl.x, y0: pl.y, x1: pl.x + s.w, y1: pl.y + s.h };
}
/** Ids of placements whose footprints overlap another's. */
export function overlapping(machines: Map<string, Machine>, placed: Placed[]): Set<string> {
  const rs = placed.flatMap((p) => { const m = machines.get(p.machineId); return m ? [{ id: p.id, ...rectOf(m, p) }] : []; });
  const bad = new Set<string>();
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) { bad.add(a.id); bad.add(b.id); }
  }
  return bad;
}
export interface Link { from: string; fromPort: string; to: string; toPort: string; kind: string }
/** Pairs of facing ports of the same shape (one side may be 'any'; two inputs or two outputs don't connect). */
export function connections(machines: Map<string, Machine>, placed: Placed[]): Link[] {
  const cell = new Map<string, { id: string; p: WPort }>();
  for (const pl of placed) { const m = machines.get(pl.machineId); if (m) for (const p of worldPorts(m, pl)) cell.set(`${p.wx},${p.wy}`, { id: pl.id, p }); }
  const out: Link[] = [];
  for (const { id, p } of cell.values()) {
    const [dx, dy] = VEC[p.dir];
    const o = cell.get(`${p.wx + dx},${p.wy + dy}`);
    if (!o || o.id === id || id > o.id) continue;                // count each pair once
    const [ox, oy] = VEC[o.p.dir];
    if (o.p.wx + ox !== p.wx || o.p.wy + oy !== p.wy || o.p.kind !== p.kind) continue;
    if (p.io && o.p.io && p.io !== "any" && o.p.io !== "any" && p.io === o.p.io) continue;
    out.push({ from: id, fromPort: p.name ?? "", to: o.id, toPort: o.p.name ?? "", kind: p.kind });
  }
  return out;
}
/** Simple shelf packing: machines in rows, `gap` tiles apart, wrapping at `maxWidth` tiles. */
export function autoArrange(items: { machineId: string; count: number }[], machines: Map<string, Machine>, maxWidth = 120, gap = 3): Placed[] {
  const out: Placed[] = []; let x = 0, y = 0, rowH = 0, n = 0;
  for (const it of items) {
    const m = machines.get(it.machineId); if (!m) continue;
    const s = sizeOf(m, 0);
    for (let i = 0; i < it.count; i++) {
      if (x > 0 && x + s.w > maxWidth) { x = 0; y += rowH + gap; rowH = 0; }
      out.push({ id: `p${++n}`, machineId: it.machineId, x, y, rot: 0 });
      x += s.w + gap; rowH = Math.max(rowH, s.h);
    }
    x += gap; // a little extra space between machine types
  }
  return out;
}
