using System; using System.Collections.Generic; using System.IO;
using Mafi; using Mafi.Core.Entities; using Mafi.Core.Mods; using Mafi.Core.Prototypes;
public enum Dir { East, North }
public struct Quantity { public int Value; public Quantity(int v) { Value = v; } }
public class Port { public int X, Y; public Dir Direction; public string Name; public Quantity Rate; }
public class Layout { public int[] Size = new[] { 5, 3 }; public List<Port> Ports = new List<Port>(); public Layout Self; public int[] LayoutTiles = new[] { 1, 2, 3 }; public Func<int> Callback = () => 1; public string Boom { get { throw new Exception("getter exploded"); } } }
public class FakeMachine : EntityProto { public Layout Layout = new Layout(); public Quantity Workers = new Quantity(8); public Qty Cost = new Qty(3); public Option<string> Maybe = new Option<string>("x"); public Option<string> Nothing; public RelTile Tile = new RelTile(1, 2); public UnityEngine.Mesh Mesh = new UnityEngine.Mesh(); public Endless Graph = new Endless(); public Proto Product; public string Graphics = "skip-me"; }
namespace UnityEngine { public class Mesh { public int[] vertices { get { throw new Exception("expensive"); } } } }
public class Endless { public Endless Next { get { return new Endless(); } } public Endless Other { get { return new Endless(); } } public int N = 1; }
// Stand-ins for the game's value types: computed properties that return more of the same struct (the real Quantity does this)
public struct Qty { public int Value; public Qty(int v) { Value = v; } public Qty Abs { get { return this; } } public Qty Times2 { get { return new Qty(Value * 2); } } public Qty AsLarge { get { return this; } } public bool IsZero { get { return Value == 0; } } public int Sign { get { return 1; } } }
public struct Option<T> { T v; bool has; public Option(T x) { v = x; has = true; } public bool HasValue { get { return has; } } public T ValueOrNull { get { return v; } } public bool IsNone { get { return !has; } } }
public struct RelTile { int x, y; public RelTile(int a, int b) { x = a; y = b; } public int X { get { return x; } } public int Y { get { return y; } } public RelTile Self { get { return this; } } }
public class FakeRecipeProto : Proto { public int Seconds = 20; }
public class Unwanted : Proto { public int X = 1; }
public class FakeBridgeSegmentProto : EntityProto { public int X = 1; }
class P {
  static void Main(string[] a) {
    var dir = a[0]; var m = new FakeMachine(); m.Layout.Self = m.Layout; m.Layout.Ports.Add(new Port { X = 1, Y = 2, Direction = Dir.North, Name = "A \"in\"", Rate = new Quantity(60) });
    m.Product = new FakeRecipeProto();
    var db = new ProtosDb(); var all = (List<Proto>)((ProtosDb)db).GetType().GetField("items").GetValue(db); all.Add(new FakeRecipeProto()); all.Add(m); all.Add(new Unwanted()); all.Add(new FakeBridgeSegmentProto());
    var mf = new ModManifest { RootDirectoryPath = dir };
    var mod = new PlannerDataExporter(mf);
    ((IMod)mod).RegisterDependencies(new DependencyResolverBuilder(), db, false); ((IMod)mod).Initialize(new DependencyResolver(), false);
  }
}
