using System; using System.Collections.Generic; using System.IO;
using Mafi; using Mafi.Core.Entities; using Mafi.Core.Mods; using Mafi.Core.Prototypes;
public enum Dir { East, North }
public struct Quantity { public int Value; public Quantity(int v) { Value = v; } }
public class Port { public int X, Y; public Dir Direction; public string Name; public Quantity Rate; }
public class Layout { public int[] Size = new[] { 5, 3 }; public List<Port> Ports = new List<Port>(); public Layout Self; public Func<int> Callback = () => 1; public string Boom { get { throw new Exception("getter exploded"); } } }
public class FakeMachine : EntityProto { public Layout Layout = new Layout(); public Quantity Workers = new Quantity(8); public Proto Product; public string Graphics = "skip-me"; }
public class FakeRecipeProto : Proto { public int Seconds = 20; }
public class Unwanted : Proto { public int X = 1; }
class P {
  static void Main(string[] a) {
    var dir = a[0]; var m = new FakeMachine(); m.Layout.Self = m.Layout; m.Layout.Ports.Add(new Port { X = 1, Y = 2, Direction = Dir.North, Name = "A \"in\"", Rate = new Quantity(60) });
    m.Product = new FakeRecipeProto();
    var db = new ProtosDb(); var all = (List<Proto>)((ProtosDb)db).GetType().GetField("items").GetValue(db); all.Add(m); all.Add(new FakeRecipeProto()); all.Add(new Unwanted());
    var mf = new ModManifest { RootDirectoryPath = dir };
    var mod = new PlannerDataExporter(mf);
    ((IMod)mod).RegisterDependencies(new DependencyResolverBuilder(), db, false); ((IMod)mod).Initialize(new DependencyResolver(), false);
  }
}
