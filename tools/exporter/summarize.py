#!/usr/bin/env python3
"""Shrinks a huge planner-data-*.json (from PlannerDataExporter) to a small summary you can send.

    python summarize.py planner-data-20261112-163000.json            ->  planner-export-summary.json  (next to the input)
    python summarize.py <input.json> <output.json>

Reads the file in chunks (one prototype at a time), so a multi-hundred-MB export needs only a little memory. The summary has,
per prototype type: count, a few ids, every field path seen, a trimmed example, and where the bytes are (the largest entries
and which fields in them are big). Standard library only.
"""
import json
import re
import sys

CHUNK = 1 << 24
BIG_LIST_KEYS = re.compile(r"layout|port|tile|cell|slot", re.I)


class Reader:
    def __init__(self, f, chunk=CHUNK):
        self.f, self.chunk, self.buf, self.pos, self.dec = f, chunk, "", 0, json.JSONDecoder()

    def more(self):
        data = self.f.read(self.chunk)
        if data:
            self.buf = self.buf[self.pos:] + data
            self.pos = 0
        return bool(data)

    def peek(self):
        while True:
            while self.pos < len(self.buf) and self.buf[self.pos] in " \t\r\n":
                self.pos += 1
            if self.pos < len(self.buf):
                return self.buf[self.pos]
            if not self.more():
                return ""

    def expect(self, ch):
        if self.peek() != ch:
            raise ValueError(f"expected {ch!r} near {self.buf[self.pos:self.pos + 40]!r}")
        self.pos += 1

    def value(self):
        """Decodes the next JSON value; returns (value, bytes_used)."""
        self.peek()
        while True:
            try:
                start = self.pos
                v, end = self.dec.raw_decode(self.buf, self.pos)
                self.pos = end
                return v, end - start
            except json.JSONDecodeError:
                if not self.more():
                    raise


def read_export(path, chunk=CHUNK):
    """-> (header dict, generator of (type, entry, size_in_chars))."""
    f = open(path, "r", encoding="utf-8-sig")
    r = Reader(f, chunk)
    while "\"protos\"" not in r.buf:
        if not r.more():
            raise ValueError("no \"protos\" in this file: is it a PlannerDataExporter export?")
    head = r.buf[: r.buf.index("\"protos\"")]
    header = {k: v for k, v in re.findall(r'"(gameVersion|exporter|exportedAt)"\s*:\s*"([^"]*)"', head)}
    m = re.search(r'"protoCount"\s*:\s*(\d+)', head)
    if m:
        header["protoCount"] = int(m.group(1))
    r.pos = r.buf.index("\"protos\"") + len("\"protos\"")

    def entries():
        r.expect(":")
        r.expect("{")
        while r.peek() != "}":
            if r.peek() == ",":
                r.pos += 1
            type_name, _ = r.value()
            r.expect(":")
            r.expect("[")
            while r.peek() != "]":
                if r.peek() == ",":
                    r.pos += 1
                entry, size = r.value()
                yield type_name, entry, size
            r.pos += 1
        f.close()

    return header, entries()


def shrink(v, arr, max_depth, depth=0, key=""):
    if v is None or isinstance(v, (bool, int, float)):
        return v
    if isinstance(v, str):
        return v if len(v) <= 80 else v[:80] + "…"
    limit = arr * 4 if BIG_LIST_KEYS.search(key) else arr
    if isinstance(v, list):
        if depth >= max_depth:
            return f"[array of {len(v)}]"
        out = [shrink(x, arr, max_depth, depth + 1, key) for x in v[:limit]]
        if len(v) > limit:
            out.append(f"… {len(v) - limit} more items")
        return out
    if isinstance(v, dict):
        if depth >= max_depth:
            ks = list(v)[:12]
            return "{" + ", ".join(ks) + (", …" if len(v) > 12 else "") + "}"
        return {k: shrink(x, arr, max_depth, depth + 1, k) for k, x in v.items()}
    return str(v)


def collect_paths(v, prefix, out, depth=0):
    t = "null" if v is None else "array" if isinstance(v, list) else "object" if isinstance(v, dict) else type(v).__name__
    out.setdefault(prefix or "$", set()).add(t)
    if depth > 8 or len(out) > 600:
        return
    if isinstance(v, list):
        for x in v[:3]:
            collect_paths(x, prefix + "[]", out, depth + 1)
    elif isinstance(v, dict):
        for k, x in v.items():
            collect_paths(x, f"{prefix}.{k}" if prefix else k, out, depth + 1)


def compact_size(v):
    return len(json.dumps(v, separators=(",", ":")))


def summarize(path, chunk=CHUNK, budget=9000):
    header, entries = read_export(path, chunk)
    types = {}
    for type_name, e, size in entries:
        t = types.setdefault(type_name, {"count": 0, "bytes": 0, "ids": [], "paths": {}, "example": None, "first_keys": None,
                                         "extra": None, "biggest": []})
        t["count"] += 1
        t["bytes"] += size
        if len(t["ids"]) < 6:
            t["ids"].append(e.get("id"))
        if t["count"] <= 40:
            collect_paths(e.get("data"), "", t["paths"])
        data = e.get("data") if isinstance(e, dict) else None
        keys = list(data) if isinstance(data, dict) else None
        if t["example"] is None:
            t["first_keys"] = keys
            for arr, depth in ((8, 7), (5, 6), (3, 5), (2, 4), (1, 3)):
                ex = {"id": e.get("id"), "name": e.get("name"), "data": shrink(data, arr, depth)}
                if compact_size(ex) <= budget:
                    break
            t["example"] = ex
        elif t["extra"] is None and keys != t["first_keys"]:
            t["extra"] = {"id": e.get("id"), "name": e.get("name"), "data": shrink(data, 3, 4)}
        # where the bytes are: keep the 3 largest entries and what is big inside them
        t["biggest"].append((size, e.get("id"), {k: compact_size(x) for k, x in data.items()} if isinstance(data, dict) else {}))
        t["biggest"] = sorted(t["biggest"], key=lambda b: -b[0])[:3]
    out_types = {}
    for name, t in types.items():
        out_types[name] = {
            "count": t["count"], "totalBytes": t["bytes"], "ids": t["ids"],
            "fieldPaths": {p: "|".join(sorted(v)) for p, v in list(t["paths"].items())[:400]},
            "example": t["example"], **({"extraExample": t["extra"]} if t["extra"] else {}),
            "largestEntries": [{"id": i, "bytes": s, "bytesByField": dict(sorted(f.items(), key=lambda kv: -kv[1])[:8])} for s, i, f in t["biggest"]],
        }
    return {"summaryOf": "PlannerDataExporter export", **header, "types": dict(sorted(out_types.items(), key=lambda kv: -kv[1]["totalBytes"]))}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else "planner-export-summary.json"
    s = summarize(src)
    text = json.dumps(s, indent=1)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {dst}: {len(text) / 1024:.0f} kB, {sum(t['count'] for t in s['types'].values())} prototypes, {len(s['types'])} types")
