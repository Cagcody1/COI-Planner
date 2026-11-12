// PlannerDataExporter: read-only export of Captain of Industry's prototype database for the COI Planner.
//
// Approach (mod skeleton, reflection-based dumping) follows BalancerDataExporter by shuntianyifang,
// MIT License, https://github.com/shuntianyifang/coi-balancer (see LICENSE-THIRD-PARTY). This file is
// separate code that also dumps building layouts (footprints, ports), storages and transports.
// It references the game's APIs but does not contain or redistribute any game files.
//
// Everything beyond Proto / EntityProto / ProtosDb is read by reflection, so a game update that renames a
// member changes the output instead of breaking the build. Output: <mod folder>\exports\planner-data-*.json.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using Mafi;
using Mafi.Core.Entities;
using Mafi.Core.Mods;
using Mafi.Core.Prototypes;

public sealed class PlannerDataExporter : DataOnlyMod, IMod {
    const string Version = "0.1.3";
    // Hard limits so a bad object graph can never hang game start-up: per prototype and for the whole export.
    const int MaxDepth = 6, MaxItems = 3000, MaxNodesPerProto = 12000;
    const int MaxSeconds = 45;
    static int nodes;
    ProtosDb database;

    public PlannerDataExporter(ModManifest manifest) : base(manifest) {}
    public override void RegisterPrototypes(ProtoRegistrator registrator) {}
    void IMod.RegisterDependencies(DependencyResolverBuilder builder, ProtosDb db, bool gameWasLoaded) { database = db; }
    void IMod.Initialize(DependencyResolver resolver, bool gameWasLoaded) {
        if (database == null) return;
        try { Export(); } catch (Exception error) { Log.Error("PlannerDataExporter: " + error); }
    }

    static Dictionary<string, object> Obj(params object[] kv) {
        var d = new Dictionary<string, object>();
        for (int i = 0; i + 1 < kv.Length; i += 2) d[(string)kv[i]] = kv[i + 1];
        return d;
    }
    static object Member(object value, string name) {
        if (value == null) return null;
        var t = value.GetType();
        var f = t.GetField(name);
        if (f != null) return f.GetValue(value);
        var p = t.GetProperties().FirstOrDefault(x => x.Name == name && x.GetIndexParameters().Length == 0);
        return p == null ? null : p.GetValue(value, null);
    }
    static string NameOf(Proto proto) {
        try { var n = Member(Member(proto, "Strings"), "Name"); if (n != null && n.ToString().Trim().Length > 0) return n.ToString(); } catch { }
        return proto.Id.ToString();
    }

    // ---- generic reflective dump ------------------------------------------------------------
    static bool Simple(object v) {
        return v is string || v is bool || v is char || v is sbyte || v is byte || v is short || v is ushort || v is int || v is uint
            || v is long || v is ulong || v is float || v is double || v is decimal;
    }
    static IEnumerable<object> Items(object v) {
        var e = v as IEnumerable;
        if (e != null) { foreach (var x in e) yield return x; yield break; }
        var t = v.GetType();
        if (t.Name.StartsWith("ImmutableArray") || t.Name.StartsWith("ImmutableList")) {   // struct collections that aren't IEnumerable
            var getEnum = t.GetMethod("GetEnumerator", Type.EmptyTypes);
            if (getEnum == null) yield break;
            var en = getEnum.Invoke(v, null);
            var move = en.GetType().GetMethod("MoveNext");
            while ((bool)move.Invoke(en, null)) yield return Member(en, "Current");
        }
    }
    static bool IsSequence(object v) {
        return v is IEnumerable || v.GetType().Name.StartsWith("ImmutableArray") || v.GetType().Name.StartsWith("ImmutableList");
    }
    static object Dump(object v, int depth, List<object> path, bool expandProto = false) {
        if (v == null) return null;
        if (Simple(v)) return v;
        var t = v.GetType();
        if (t.IsEnum) return v.ToString();
        if (v is Type) return ((Type)v).FullName;
        var proto = v as Proto;
        if (proto != null && !expandProto) return Obj("protoId", proto.Id.ToString());     // references to other prototypes stay ids
        if (typeof(Delegate).IsAssignableFrom(t)) return null;
        if (depth > MaxDepth) return Obj("truncated", t.FullName);
        if (++nodes > MaxNodesPerProto) return Obj("truncated", "node limit");
        var ns = t.Namespace ?? "";
        if (ns.StartsWith("UnityEngine") || ns.StartsWith("System.Reflection") || ns.StartsWith("System.Threading") || ns.StartsWith("System.IO"))
            return Obj("skipped", t.FullName);                                  // engine objects are slow/unsafe to walk
        if (!t.IsValueType && path.Any(x => ReferenceEquals(x, v))) return Obj("cycle", t.FullName);
        path.Add(v);
        try {
            // Game value types (Quantity, PartialQuantity, Fix32, Option ...) have computed properties that return more of the
            // same struct (Abs.Abs.Abs..., AsLarge, Times2Fast). Walking those never ends and fills the file with noise, so
            // structs are dumped by their stored fields only; Option is unwrapped; a struct without public fields gets only its
            // simple-typed properties.
            if (t.IsValueType && !IsSequence(v)) return DumpStruct(v, t, depth, path);
            if (IsSequence(v)) {
                var list = new List<object>(); int n = 0;
                foreach (var x in Items(v)) { if (++n > MaxItems) { list.Add(Obj("truncatedAfter", MaxItems)); break; } list.Add(Dump(x, depth + 1, path)); }
                return list;
            }
            var o = Obj("type", t.FullName);
            foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.Instance)) {
                if (Skip(f.Name, f.FieldType)) continue;
                try { o[f.Name] = Dump(f.GetValue(v), depth + 1, path); } catch (Exception e) { o[f.Name] = Obj("error", e.Message); }
            }
            foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance)) {
                if (!p.CanRead || p.GetIndexParameters().Length != 0 || Skip(p.Name, p.PropertyType) || o.ContainsKey(p.Name)) continue;
                try { o[p.Name] = Dump(p.GetValue(v, null), depth + 1, path); } catch (Exception e) { o[p.Name] = Obj("error", e.InnerException != null ? e.InnerException.Message : e.Message); }
            }
            return o;
        } finally { path.RemoveAt(path.Count - 1); }
    }
    static object DumpStruct(object v, Type t, int depth, List<object> path) {
        if (t.Name.StartsWith("Option`")) {
            var has = Member(v, "HasValue");
            if (!(has is bool) || !(bool)has) return Obj("none", true);
            return Obj("some", Dump(Member(v, "ValueOrNull"), depth + 1, path));
        }
        var o = Obj("type", t.FullName);
        bool any = false;
        foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.Instance)) {
            if (Skip(f.Name, f.FieldType)) continue;
            any = true;
            try { o[f.Name] = Dump(f.GetValue(v), depth + 1, path); } catch (Exception e) { o[f.Name] = Obj("error", e.Message); }
        }
        if (!any) {
            foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance)) {
                if (!p.CanRead || p.GetIndexParameters().Length != 0) continue;
                var pt = p.PropertyType;
                if (!(pt.IsPrimitive || pt.IsEnum || pt == typeof(string)) || Skip(p.Name, pt)) continue;
                try { o[p.Name] = Dump(p.GetValue(v, null), depth + 1, path); } catch (Exception e) { o[p.Name] = Obj("error", e.Message); }
            }
        }
        return o;
    }
    static bool Skip(string name, Type type) {
        return name == "Graphics" || name == "Strings" || name == "Mod" || name == "Gfx" || type.Name == "Gfx" || name.EndsWith("Graphics")
            || typeof(Delegate).IsAssignableFrom(type) || type == typeof(IntPtr);
    }

    // ---- export ---------------------------------------------------------------------------------
    static int Priority(Proto p) {
        if (p is EntityProto) return 0;
        var n = p.GetType().Name;
        if (n.Contains("Recipe")) return 1;
        if (n.Contains("Transport") || n.Contains("Storage")) return 2;
        return 3;
    }
    static bool Wanted(Proto p) {
        if (p is EntityProto) return true;                                  // buildings, machines, storages: includes layouts
        var n = p.GetType().Name;
        return n.Contains("Recipe") || n.Contains("Product") || n.Contains("Transport") || n.Contains("Storage");
    }
    void Export() {
        var groups = new Dictionary<string, List<object>>();
        var errors = new List<object>(); int count = 0;
        var clock = System.Diagnostics.Stopwatch.StartNew();
        // Most important first, so a time limit can only cut the least useful: buildings (layouts), recipes, transports/storages, then the rest.
        var ordered = new List<Proto>();
        foreach (var p in database.All<Proto>()) if (Wanted(p)) ordered.Add(p);
        ordered = ordered.OrderBy(p => Priority(p)).ToList();
        int skipped = 0;
        foreach (var proto in ordered) {
            if (clock.Elapsed.TotalSeconds > MaxSeconds) { skipped++; continue; }
            nodes = 0;
            var type = proto.GetType().FullName;
            try {
                if (!groups.ContainsKey(type)) groups[type] = new List<object>();
                groups[type].Add(Obj("id", proto.Id.ToString(), "name", NameOf(proto), "data", Dump(proto, 0, new List<object>(), true)));
                count++;
            } catch (Exception e) { errors.Add(Obj("id", proto.Id.ToString(), "type", type, "error", e.Message)); }
        }
        if (skipped > 0) errors.Add(Obj("error", "time limit reached; prototypes skipped", "seconds", MaxSeconds, "skipped", skipped));
        string version = null;
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies()) {
            Type[] types; try { types = asm.GetTypes(); } catch { continue; }
            foreach (var t in types.Where(x => x.Name == "GameVersion")) {
                var f = t.GetField("FULL_VERSION", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
                if (f != null) version = Convert.ToString(f.GetValue(null));
            }
        }
        var package = Obj("schemaVersion", 1, "exporter", "PlannerDataExporter " + Version, "gameVersion", version,
            "exportedAt", DateTime.UtcNow.ToString("o"), "protoCount", count, "protos", groups, "errors", errors);
        var folder = Path.Combine(Manifest.RootDirectoryPath, "exports");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "planner-data-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + ".json");
        File.WriteAllText(path, Json(package), new UTF8Encoding(false));
        Log.Info("PlannerDataExporter: wrote " + count + " prototypes to " + path + " in " + clock.Elapsed.TotalSeconds.ToString("0.0", CultureInfo.InvariantCulture) + " s");
    }

    // ---- minimal JSON writer ----------------------------------------------------------------------
    static string Json(object v) {
        if (v == null) return "null";
        if (v is string) return "\"" + Esc((string)v) + "\"";
        if (v is char) return "\"" + Esc(v.ToString()) + "\"";
        if (v is bool) return (bool)v ? "true" : "false";
        if (v is float || v is double) { var d = Convert.ToDouble(v, CultureInfo.InvariantCulture); return double.IsNaN(d) || double.IsInfinity(d) ? "null" : d.ToString("R", CultureInfo.InvariantCulture); }
        var dict = v as IDictionary;
        if (dict != null) { var parts = new List<string>(); foreach (DictionaryEntry e in dict) parts.Add(Json(e.Key.ToString()) + ":" + Json(e.Value)); return "{" + string.Join(",", parts) + "}"; }
        var seq = v as IEnumerable;
        if (seq != null) { var parts = new List<string>(); foreach (var x in seq) parts.Add(Json(x)); return "[" + string.Join(",", parts) + "]"; }
        return Convert.ToString(v, CultureInfo.InvariantCulture);
    }
    static string Esc(string s) {
        var b = new StringBuilder();
        foreach (var c in s) { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 32) b.Append("\\u" + ((int)c).ToString("x4")); else b.Append(c); }
        return b.ToString();
    }
}
