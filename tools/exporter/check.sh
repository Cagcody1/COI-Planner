#!/bin/sh
# Checks PlannerDataExporter.cs without the game, using Mono's mcs and stand-in game types (stubs/GameStubs.cs):
#   1. it compiles (type-check), 2. it runs against a fake database and writes valid JSON with the expected content.
# This does NOT prove it works against the real game; that needs a run in the game (see README.md).
set -e
cd "$(dirname "$0")"
OUT="${TMPDIR:-/tmp}/planner-exporter-check"; rm -rf "$OUT"; mkdir -p "$OUT/run"
mcs -target:library -out:"$OUT/PlannerDataExporter.dll" PlannerDataExporter.cs stubs/GameStubs.cs
echo "type-check OK"
mcs -out:"$OUT/harness.exe" test/Harness.cs stubs/GameStubs.cs PlannerDataExporter.cs
mono "$OUT/harness.exe" "$OUT/run"
python3 -I - "$OUT/run/exports" <<'PY'
import glob, json, sys
d = json.load(open(glob.glob(sys.argv[1] + "/*.json")[0]))
assert d["errors"] == [], d["errors"]
assert set(d["protos"]) == {"FakeMachine", "FakeRecipeProto"}, list(d["protos"])      # Unwanted is filtered out
m = d["protos"]["FakeMachine"][0]["data"]
assert m["Layout"]["Size"] == [5, 3] and m["Layout"]["Ports"][0]["Direction"] == "North"      # layout + ports + enums
assert m["Workers"]["Value"] == 8 and m["Product"] == {"protoId": "id"}                       # structs; proto refs stay ids
assert m["Layout"]["Self"] == {"cycle": "Layout"} and "error" in m["Layout"]["Boom"]          # cycles and throwing getters survive
assert "Graphics" not in m and "Callback" not in m["Layout"]                                  # graphics / delegates skipped
print("fake-database run OK:", d["protoCount"], "prototypes")
PY
