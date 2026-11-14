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
    const string Version = "0.3.3";
    // Hard limits so a bad object graph can never hang game start-up: per prototype and for the whole export.
    const int MaxDepth = 6, MaxItems = 3000;
    static int NodeLimit = 12000;
    const int MaxSeconds = 45;
    static int nodes;
    ProtosDb database;
    DependencyResolver resolverRef;

    public PlannerDataExporter(ModManifest manifest) : base(manifest) {}
    public override void RegisterPrototypes(ProtoRegistrator registrator) {}
    void IMod.RegisterDependencies(DependencyResolverBuilder builder, ProtosDb db, bool gameWasLoaded) { database = db; }
    void IMod.Initialize(DependencyResolver resolver, bool gameWasLoaded) {
        if (database == null) return;
        try { Export(); } catch (Exception error) { Log.Error("PlannerDataExporter: " + error); }
        try { ExportBlueprintApi(); } catch (Exception error) { Log.Error("PlannerDataExporter (blueprint api): " + error); }
        resolverRef = resolver;
        try { var t = new System.Threading.Thread(BlueprintProbe); t.IsBackground = true; t.Start(); } catch (Exception error) { Log.Error("PlannerDataExporter (blueprint probe): " + error); }
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
        if (IsImmutable(t)) {   // struct collections that aren't IEnumerable
            var getEnum = t.GetMethod("GetEnumerator", Type.EmptyTypes);
            if (getEnum == null) {                                              // fall back to Length + indexer
                var len = Member(v, "Length"); var idx = t.GetProperties().FirstOrDefault(x => x.GetIndexParameters().Length == 1);
                if (!(len is int) || idx == null) yield break;
                for (int i = 0; i < (int)len; i++) yield return idx.GetValue(v, new object[] { i });
                yield break;
            }
            var en = getEnum.Invoke(v, null);
            var move = en.GetType().GetMethod("MoveNext");
            while ((bool)move.Invoke(en, null)) yield return Member(en, "Current");
        }
    }
    static bool IsImmutable(Type t) {
        return t.Name.Contains("ImmutableArray") || t.Name.StartsWith("ImmutableList");
    }
    static bool IsSequence(object v) {
        return v is IEnumerable || IsImmutable(v.GetType());
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
        if (++nodes > NodeLimit) return Obj("truncated", "node limit");
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
    // Terrain/geometry data the planner never uses; it is by far the biggest part of every building.
    static readonly HashSet<string> HeavyFields = new HashSet<string> {
        "LayoutTiles", "TerrainVertices", "VehicleSurfaceHeights", "TrajectoryData", "TrainTrackHelper", "LanesTrajectories",
        "LanesData", "LanesSpecs", "Upgrade", "AnimationParams", "CustomTokens", "OccupiedVertexToPillarIndex", "Pillars", "IconPath"
    };
    static bool Skip(string name, Type type) {
        return HeavyFields.Contains(name) || name == "Graphics" || name == "Strings" || name == "Mod" || name == "Gfx" || type.Name == "Gfx" || name.EndsWith("Graphics")
            || typeof(Delegate).IsAssignableFrom(type) || type == typeof(IntPtr);
    }

    // ---- export ---------------------------------------------------------------------------------
    static int Priority(Proto p) {
        var n = p.GetType().Name;
        if (n.Contains("Product")) return 0;                                // names and kinds first: everything refers to them
        if (n.Contains("Recipe") || n.Contains("ResearchNode")) return 1;
        if (p is EntityProto) return n.Contains("Machine") || n.Contains("Transport") || n.Contains("Storage") ? 2 : 3;
        return 3;
    }
    static readonly string[] Unwanted = { "Bridge", "Billboard", "Decoration", "RetainingWall", "Barrier", "Ruins", "Sandbox", "ProductsSource", "ProductsSink", "Pillar" };
    static bool Wanted(Proto p) {
        var n = p.GetType().Name;
        if (Unwanted.Any(u => n.Contains(u))) return false;                 // thousands of cosmetic/bridge pieces, hundreds of MB
        if (p is EntityProto) return true;                                  // buildings, machines, storages: includes layouts
        return n.Contains("Recipe") || n.Contains("ResearchNode") || n.Contains("Product") || n.Contains("Transport") || n.Contains("Storage");
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

    // ---- blueprint API discovery ------------------------------------------------------------------
    // Lists the game's blueprint classes and their methods, so the planner can be written against the real serializer.
    static string TypeName(Type t) { try { return t.ToString(); } catch { return "?"; } }
    static object Sig(MethodBase m) {
        var ps = new List<object>();
        try { foreach (var p in m.GetParameters()) ps.Add(TypeName(p.ParameterType) + " " + p.Name); } catch { }
        var mi = m as MethodInfo;
        return Obj("name", m.Name, "static", m.IsStatic, "public", m.IsPublic, "params", ps, "returns", mi == null ? "ctor" : TypeName(mi.ReturnType));
    }
    void ExportBlueprintApi() {
        var types = new List<object>(); int seen = 0;
        const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies()) {
            var an = asm.GetName().Name;
            if (!an.StartsWith("Mafi")) continue;
            Type[] list; try { list = asm.GetTypes(); } catch (ReflectionTypeLoadException e) { list = e.Types.Where(x => x != null).ToArray(); } catch { continue; }
            foreach (var t in list) {
                var n = t.FullName ?? t.Name;
                bool bp = n.IndexOf("Blueprint", StringComparison.OrdinalIgnoreCase) >= 0;
                bool ser = n.EndsWith("BlobWriter") || n.EndsWith("BlobReader") || n.EndsWith("BlueprintSerializer");
                if (!bp && !ser) continue;
                seen++;
                var methods = new List<object>(); var fields = new List<object>(); var props = new List<object>();
                try { foreach (var m in t.GetMethods(all)) if (!m.IsSpecialName) methods.Add(Sig(m)); foreach (var c in t.GetConstructors(all)) methods.Add(Sig(c)); } catch { }
                try { foreach (var f in t.GetFields(all)) fields.Add(Obj("name", f.Name, "type", TypeName(f.FieldType), "static", f.IsStatic, "public", f.IsPublic)); } catch { }
                try { foreach (var p in t.GetProperties(all)) props.Add(Obj("name", p.Name, "type", TypeName(p.PropertyType), "canRead", p.CanRead, "canWrite", p.CanWrite)); } catch { }
                var ifaces = new List<object>(); try { foreach (var i in t.GetInterfaces()) ifaces.Add(TypeName(i)); } catch { }
                types.Add(Obj("assembly", an, "type", n, "kind", t.IsEnum ? "enum" : t.IsInterface ? "interface" : t.IsValueType ? "struct" : t.IsAbstract && t.IsSealed ? "static class" : t.IsAbstract ? "abstract class" : "class",
                    "base", t.BaseType == null ? null : TypeName(t.BaseType), "interfaces", ifaces, "fields", fields, "properties", props, "methods", methods,
                    "enumValues", t.IsEnum ? (object)Enum.GetNames(t) : null));
            }
        }
        var folder = Path.Combine(Manifest.RootDirectoryPath, "exports");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "blueprint-api.json");
        File.WriteAllText(path, Json(Obj("exporter", "PlannerDataExporter " + Version, "typeCount", seen, "types", types)), new UTF8Encoding(false));
        Log.Info("PlannerDataExporter: wrote " + seen + " blueprint-related types to " + path);
    }

    // ---- blueprint probe -------------------------------------------------------------------------
    // Finds the game's blueprint library, exports every blueprint in it (name, folder, the game's own text string and a
    // reflective dump of its contents), and decodes any text files in blueprints\in with the game's own parser, checking that
    // writing the result back gives the same string. Everything it learns goes into exports\blueprint-probe.json.
    static object Opt(object o) {   // Mafi.Option<T> -> value or null
        if (o == null) return null;
        var has = Member(o, "HasValue");
        if (has is bool) return (bool)has ? Member(o, "Value") : null;
        return o;
    }
    static string IdOf(object x) {
        x = Opt(x); if (x == null) return null;
        var id = Member(x, "Id"); return Convert.ToString(id != null ? id : x);
    }
    static List<object> Pt(object t) { return new List<object> { Member(t, "X"), Member(t, "Y"), Member(t, "Z") }; }
    static object Compact(object bp) {
        var list = new List<object>();
        foreach (var it in Seq(Member(bp, "Items"))) {
            try {
                var e = Obj("proto", IdOf(Member(it, "Prototype")), "kind", Convert.ToString(Opt(Member(it, "EntityType"))));
                var k = e["kind"] as string; if (k != null) { var dot = k.LastIndexOf('.'); if (dot >= 0) e["kind"] = k.Substring(dot + 1); }
                var id = Member(Member(it, "OriginalEntityId"), "Value"); if (id != null) e["id"] = id;
                var tr = Member(it, "Transform");
                if (tr != null) { e["pos"] = Pt(Member(tr, "Position")); e["rot"] = Member(Member(tr, "Rotation"), "AngleIndex"); e["flip"] = Member(tr, "IsReflected"); }
                var title = Opt(Member(it, "CustomTitle")); if (title != null) e["title"] = title;
                var rec = Opt(Member(it, "Recipes"));
                if (rec != null) { var rl = new List<object>(); foreach (var r in Seq(rec)) rl.Add(IdOf(r)); if (rl.Count > 0) e["recipes"] = rl; }
                var tj = Opt(Member(it, "Trajectory"));
                if (tj != null) {
                    var pv = new List<object>(); foreach (var q in Seq(Member(tj, "Pivots"))) pv.Add(Pt(q));
                    e["pivots"] = pv; e["startDir"] = Pt(Member(tj, "StartDirection")); e["endDir"] = Pt(Member(tj, "EndDirection"));
                    e["maxProducts"] = Member(tj, "MaxProducts");
                }
                list.Add(e);
            } catch (Exception ex) { list.Add(Obj("error", ex.Message)); }
        }
        return list;
    }
    static Type FindType(string fullName) {
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies()) { try { var t = asm.GetType(fullName, false); if (t != null) return t; } catch { } }
        return null;
    }
    static IEnumerable<object> Seq(object v) {
        if (v == null) yield break;
        var e = v as IEnumerable;
        if (e != null) { foreach (var x in e) yield return x; yield break; }
        var count = Member(v, "Count");
        var idx = v.GetType().GetProperties().FirstOrDefault(x => x.GetIndexParameters().Length == 1 && x.GetIndexParameters()[0].ParameterType == typeof(int));
        if (count is int && idx != null) { for (int i = 0; i < (int)count; i++) yield return idx.GetValue(v, new object[] { i }); yield break; }
        foreach (var x in Items(v)) yield return x;
    }
    static object Unwrap(object r, Type t) {
        if (r == null) return null;
        if (t.IsInstanceOfType(r)) return r;
        var v = Member(r, "Value");   // Option<T>
        return v != null && t.IsInstanceOfType(v) ? v : null;
    }
    object TryResolve(Type t, List<object> steps) {
        if (resolverRef == null || t == null) return null;
        var names = new[] { "Resolve", "TryResolve", "GetResolvedInstance", "GetResolvedDependency" };
        foreach (var name in names) {
            foreach (var m in resolverRef.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)) {
                if (m.Name != name || m.GetParameters().Length > 1) continue;
                try {
                    var ps = m.GetParameters();
                    object r;
                    if (m.IsGenericMethodDefinition) {
                        if (m.GetGenericArguments().Length != 1 || ps.Length != 0) continue;
                        r = m.MakeGenericMethod(t).Invoke(resolverRef, null);
                    } else {
                        if (ps.Length != 1 || ps[0].ParameterType != typeof(Type)) continue;
                        r = m.Invoke(resolverRef, new object[] { t });
                    }
                    var u = Unwrap(r, t);
                    steps.Add(Obj("method", name, "generic", m.IsGenericMethodDefinition, "ok", u != null, "returned", r == null ? null : r.GetType().Name));
                    if (u != null) return u;
                } catch (Exception e) { steps.Add(Obj("method", name, "error", e.InnerException != null ? e.InnerException.Message : e.Message)); }
            }
        }
        try {
            foreach (var o in Seq(Member(resolverRef, "AllResolvedInstances"))) if (o != null && t.IsInstanceOfType(o)) { steps.Add(Obj("method", "AllResolvedInstances scan", "ok", true)); return o; }
        } catch (Exception e) { steps.Add(Obj("method", "AllResolvedInstances scan", "error", e.Message)); }
        return null;
    }
    static object Call(object target, Type type, string name, int argCount, object[] args) {
        foreach (var m in type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
            if (m.Name == name && m.GetParameters().Length == argCount && !m.IsGenericMethodDefinition) return m.Invoke(m.IsStatic ? null : target, args);
        throw new MissingMethodException(type.Name + "." + name + "/" + argCount);
    }
    void BlueprintProbe() {
        var probe = Obj("exporter", "PlannerDataExporter " + Version);
        var steps = new List<object>(); probe["steps"] = steps;
        try {
            var folder = Path.Combine(Manifest.RootDirectoryPath, "exports"); Directory.CreateDirectory(folder);
            var rm = new List<object>();
            foreach (var m in resolverRef.GetType().GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
                if (m.DeclaringType != typeof(object)) rm.Add(Obj("name", m.Name, "generic", m.IsGenericMethodDefinition, "public", m.IsPublic, "params", Sig(m)));
            probe["resolverType"] = TypeName(resolverRef.GetType()); probe["resolverMethods"] = rm;
            var libType = FindType("Mafi.Core.Entities.Blueprints.BlueprintsLibrary");
            probe["libraryType"] = libType == null ? null : libType.FullName;
            var lib = TryResolve(libType, steps);
            probe["libraryFound"] = lib != null;
            object ctx = null;
            if (lib != null) {
                var f = libType.GetField("m_serializationContext", BindingFlags.NonPublic | BindingFlags.Instance);
                ctx = f == null ? null : f.GetValue(lib);
                for (int i = 0; i < 75; i++) { var st = Convert.ToString(Member(lib, "LibraryStatus")); probe["libraryStatus"] = st; if (st == "LoadSuccess" || st.StartsWith("LoadFailed") || st == "NoLibraryFound") break; System.Threading.Thread.Sleep(2000); }
                var list = new List<object>();
                Action<object, string> walk = null;
                walk = (fld, path) => {
                    foreach (var bp in Seq(Member(fld, "Blueprints"))) {
                        var entry = Obj("folder", path, "name", Member(bp, "Name"), "description", Member(bp, "Desc"), "gameVersion", Member(bp, "GameVersion"));
                        try { entry["itemCount"] = Items(Member(bp, "Items")).Count(); } catch (Exception e) { entry["itemCountError"] = e.Message; }
                        try { entry["string"] = Call(lib, libType, "ConvertToString", 2, new object[] { bp, false }); } catch (Exception e) { entry["stringError"] = e.InnerException != null ? e.InnerException.Message : e.Message; }
                        try { entry["entities"] = Compact(bp); } catch (Exception e) { entry["dumpError"] = e.Message; }
                        list.Add(entry);
                    }
                    foreach (var sub in Seq(Member(fld, "Folders"))) walk(sub, path + "/" + Convert.ToString(Member(sub, "Name")));
                };
                walk(Member(lib, "Root"), "");
                File.WriteAllText(Path.Combine(folder, "blueprint-library.json"), Json(Obj("exporter", "PlannerDataExporter " + Version, "count", list.Count, "blueprints", list)), new UTF8Encoding(false));
                probe["libraryBlueprints"] = list.Count;
            }
            // decode test strings with the game's own parser
            var tests = new List<object>(); probe["parseTests"] = tests;
            var inDir = Path.Combine(Manifest.RootDirectoryPath, "blueprints", "in");
            if (Directory.Exists(inDir) && libType != null) {
                foreach (var file in Directory.GetFiles(inDir, "*.txt")) {
                    var t = Obj("file", Path.GetFileName(file));
                    tests.Add(t);
                    try {
                        var text = File.ReadAllText(file).Trim();
                        MethodInfo pm = null;
                        var sigs = new List<object>(); t["parseMethods"] = sigs;
                        foreach (var m in libType.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
                            if (m.Name.IndexOf("Parse", StringComparison.OrdinalIgnoreCase) >= 0 || m.Name.IndexOf("FromString", StringComparison.OrdinalIgnoreCase) >= 0) { sigs.Add(Sig(m)); if (m.Name == "TryParseFromString" && pm == null) pm = m; }
                        if (pm == null) throw new MissingMethodException("TryParseFromString");
                        var pars = pm.GetParameters(); var args = new object[pars.Length]; int strAt = -1;
                        for (int i = 0; i < pars.Length; i++) {
                            var pt = pars[i].ParameterType; if (pt.IsByRef) pt = pt.GetElementType();
                            if (pars[i].IsOut || pars[i].ParameterType.IsByRef) args[i] = pt.IsValueType ? Activator.CreateInstance(pt) : null;
                            else if (pt == typeof(string) && strAt < 0) { args[i] = text; strAt = i; }
                            else if (ctx != null && pt.IsInstanceOfType(ctx)) args[i] = ctx;
                            else if (pt == typeof(bool)) args[i] = false;
                        }
                        var ok = pm.Invoke(pm.IsStatic ? null : lib, args);
                        t["parsed"] = ok;
                        object parsed = null;
                        for (int i = 0; i < pars.Length; i++) if (pars[i].ParameterType.IsByRef) { var o = args[i]; if (o is string) t["error"] = o; else if (o != null && parsed == null) parsed = o; }
                        if (parsed == null && ok != null && !(ok is bool)) parsed = ok;
                        if ((ok is bool ? (bool)ok : true) && parsed != null) {
                            var bp = Member(parsed, "Value") != null && parsed.GetType().Name.StartsWith("Option") ? Member(parsed, "Value") : parsed;
                            t["name"] = Member(bp, "Name"); t["gameVersion"] = Member(bp, "GameVersion");
                            try { t["entities"] = Compact(bp); } catch (Exception e) { t["dumpError"] = e.Message; }
                            try { var back = Convert.ToString(Call(lib, libType, "ConvertToString", 2, new object[] { bp, false })); t["roundTripEqual"] = back == text; t["roundTripLength"] = back.Length; t["inputLength"] = text.Length; if (back != text) t["roundTripString"] = back; } catch (Exception e) { t["roundTripError"] = e.InnerException != null ? e.InnerException.Message : e.Message; }
                        }
                    } catch (Exception e) { t["exception"] = e.InnerException != null ? e.InnerException.ToString() : e.ToString(); }
                }
            }
        } catch (Exception e) { probe["exception"] = e.ToString(); }
        try { File.WriteAllText(Path.Combine(Manifest.RootDirectoryPath, "exports", "blueprint-probe.json"), Json(probe), new UTF8Encoding(false)); Log.Info("PlannerDataExporter: wrote blueprint-probe.json"); } catch { }
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
