// NOT part of the mod. Minimal stand-ins for the game's types so PlannerDataExporter.cs can be type-checked
// without the game installed (tools/exporter/check.sh). They mirror only the members the exporter uses.
using System;
using System.Collections.Generic;
namespace Mafi {
    public static class Log { public static void Info(string s) {} public static void Error(string s) {} }
    public class DependencyResolverBuilder {}
    public class DependencyResolver {}
}
namespace Mafi.Core.Mods {
    public class ModManifest { public string RootDirectoryPath = ""; public string Id = ""; }
    public class ProtoRegistrator {}
    public interface IMod { void RegisterDependencies(Mafi.DependencyResolverBuilder b, Mafi.Core.Prototypes.ProtosDb db, bool gameWasLoaded); void Initialize(Mafi.DependencyResolver r, bool gameWasLoaded); }
    public abstract class DataOnlyMod { protected DataOnlyMod(ModManifest m) { Manifest = m; } public ModManifest Manifest; public abstract void RegisterPrototypes(ProtoRegistrator registrator); }
}
namespace Mafi.Core.Prototypes {
    public class ProtoId { public override string ToString() { return "id"; } }
    public abstract class Proto { public ProtoId Id = new ProtoId(); public object Strings; }
    public class ProtosDb { public List<Proto> items = new List<Proto>(); public IEnumerable<T> All<T>() where T : Proto { foreach (var x in items) { var t = x as T; if (t != null) yield return t; } } }
}
namespace Mafi.Core.Entities { public class EntityProto : Mafi.Core.Prototypes.Proto {} }
