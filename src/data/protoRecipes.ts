// Recipe table ported from the coi-ratio.html prototype (sourced from wiki.coigame.com).
// Stand-in until the in-game export (tools/exporter) provides exact data.
export interface ProtoRecipe { machine: string; time: number; inp: Record<string, number>; out: Record<string, number>; label?: string }
export const PROTO: ProtoRecipe[] = [];
const add = (machine: string, time: number, inp: Record<string, number>, out: Record<string, number>, label?: string) =>
  PROTO.push({ machine, time, inp, out, label });
const asm = (l: string) => "Assembly " + l;
type A = [string, number, number];
(<A[]>[["I",40,1],["II",20,1],["III",10,1],["IV",10,2],["V",10,4]]).forEach(([t,s,m])=>add(asm(t),s,{"Iron":3*m,"Wood":3*m,"Concrete Slab":4*m},{"Construction Parts":4*m},"from Iron"));
(<A[]>[["III",10,1],["IV",10,2],["V",10,4]]).forEach(([t,s,m])=>add(asm(t),s,{"Steel":2*m,"Wood":2*m,"Concrete Slab":3*m},{"Construction Parts":4*m},"from Steel"));
(<A[]>[["I",80,1],["II",40,2],["III",20,4],["IV",10,8],["V",10,16]]).forEach(([t,s,m])=>add(asm(t),s,{"Construction Parts":6*m,"Electronics":3*m},{"Construction Parts II":3*m}));
(<A[]>[["II",80,1],["III",40,2],["IV",20,4],["V",10,8]]).forEach(([t,s,m])=>add(asm(t),s,{"Construction Parts II":6*m,"Steel":3*m},{"Construction Parts III":3*m}));
(<A[]>[["III",80,1],["IV",40,2],["V",20,4]]).forEach(([t,s,m])=>add(asm(t),s,{"Construction Parts III":6*m,"Electronics II":3*m},{"Construction Parts IV":3*m}));
(<A[]>[["I",60,1],["II",30,2],["III",15,4],["IV",15,8],["V",15,16]]).forEach(([t,s,m])=>add(asm(t),s,{"Rubber":1*m,"Copper":6*m},{"Electronics":6*m}));
([["III",40],["IV",20],["V",10]] as [string,number][]).forEach(([t,s])=>add(asm(t),s,{"PCB":4,"Electronics":8,"Polysilicon":2},{"Electronics II":4}));
([["III",40],["IV",20],["V",10]] as [string,number][]).forEach(([t,s])=>add(asm(t),s,{"Glass":2,"Plastic":4,"Copper":2},{"PCB":8}));
(<A[]>[["I",40,1],["II",20,1],["III",10,1],["IV",10,2],["V",10,4]]).forEach(([t,s,m])=>add(asm(t),s,{"Iron":5*m},{"Mechanical Parts":4*m},"from Iron"));
(<A[]>[["III",20,1],["IV",10,1],["V",10,2]]).forEach(([t,s,m])=>add(asm(t),s,{"Steel":4*m},{"Mechanical Parts":8*m},"from Steel"));
add("Blast Furnace",20,{"Iron Ore":10,"Coal":4},{"Molten Iron":8,"Slag":4,"Exhaust":8},"Iron Ore");
add("Blast Furnace",20,{"Iron Scrap":8,"Coal":2},{"Molten Iron":8,"Exhaust":6},"Iron Scrap");
add("Blast Furnace II",20,{"Iron Ore Crushed":16,"Limestone":2,"Coal":5},{"Molten Iron":16,"Slag":6,"Exhaust":12},"Crushed ore");
add("Blast Furnace II",20,{"Iron Scrap":16,"Coal":3},{"Molten Iron":16,"Exhaust":9},"Iron Scrap");
add("Arc Furnace",20,{"Iron Ore Crushed":8,"Limestone":1,"Graphite":1},{"Molten Iron":8,"Slag":3,"Exhaust":2},"Crushed ore");
add("Blast Furnace",20,{"Copper Ore":10,"Coal":4},{"Molten Copper":8,"Slag":4,"Exhaust":8},"Copper Ore");
add("Blast Furnace",20,{"Copper Scrap":8,"Coal":2},{"Molten Copper":8,"Exhaust":6},"Copper Scrap");
add("Blast Furnace",20,{"Glass Mix":10,"Coal":4},{"Molten Glass":8,"Slag":4,"Exhaust":8},"Glass Mix");
add("Blast Furnace",20,{"Broken Glass":12,"Coal":2},{"Molten Glass":8,"Exhaust":6},"Broken Glass");
add("Metal Caster",40,{"Molten Iron":8},{"Iron":8});
add("Metal Caster II",20,{"Molten Iron":8},{"Iron":8});
add("Metal Caster",40,{"Molten Copper":8},{"Impure Copper":8});
add("Metal Caster II",20,{"Molten Copper":8},{"Impure Copper":8});
add("Copper Electrolysis",40,{"Impure Copper":24,"Acid":6},{"Copper":16},"with Acid");
add("Copper Electrolysis",40,{"Impure Copper":24,"Water":6},{"Copper":13},"with Water");
add("Oxygen Furnace",40,{"Molten Iron":16,"Oxygen":12},{"Molten Steel":8,"Exhaust":16});
add("Oxygen Furnace II",40,{"Molten Iron":32,"Oxygen":12},{"Molten Steel":16,"Exhaust":24});
add("Cooled Caster",40,{"Molten Steel":12,"Water":6},{"Steel":12});
add("Cooled Caster II",20,{"Molten Steel":24,"Water":12},{"Steel":24});
add("Air Separator",20,{},{"Oxygen":12,"Nitrogen":12});
add("Glass Maker",20,{"Molten Glass":8},{"Glass":4,"Broken Glass":4});
add("Glass Maker II",20,{"Molten Glass":8},{"Glass":8});
add("Mixer",20,{"Sand":20,"Limestone":5,"Salt":2},{"Glass Mix":20},"no Acid");
add("Mixer II",10,{"Sand":20,"Limestone":5,"Salt":2},{"Glass Mix":20},"no Acid");
add("Crusher",30,{"Iron Ore":16},{"Iron Ore Crushed":16});
add("Crusher",20,{"Slag":8},{"Slag Crushed":8});
add("Rotary Kiln",40,{"Limestone":6,"Coal":1},{"Cement":2,"Exhaust":6});
([["Concrete Mixer",40,1],["Concrete Mixer II",20,1],["Concrete Mixer III",20,2]] as [string,number,number][]).forEach(([mc,s,m])=>{
  add(mc,s,{"Cement":1*m,"Sand":2*m,"Gravel":6*m,"Water":4*m},{"Concrete Slab":8*m},"Gravel");
  add(mc,s,{"Cement":1*m,"Sand":2*m,"Slag Crushed":6*m,"Water":4*m},{"Concrete Slab":8*m},"Crushed slag");
});
add("Rubber Maker",30,{"Diesel":8,"Coal":2},{"Rubber":8},"Diesel + Coal");
add("Rubber Maker",20,{"Diesel":12,"Sulfur":3},{"Rubber":8},"Diesel + Sulfur");
add("Basic Distiller",20,{"Crude Oil":20,"Coal":2},{"Diesel":9,"Waste Water":5,"Exhaust":12});
add("Polymerization Plant",30,{"Naphtha":6,"Chlorine":4},{"Plastic":18,"Exhaust":12});
(<A[]>[["I",30,1],["II",15,1],["III",8,1],["IV",8,2],["V",8,4]]).forEach(([t,s,m])=>add(asm(t),s,{"Mechanical Parts":3*m,"Electronics":1*m},{"Vehicle Parts":2*m}));
([["III",30],["IV",15],["V",8]] as [string,number][]).forEach(([t,s])=>add(asm(t),s,{"Vehicle Parts":4,"Steel":2,"Glass":1},{"Vehicle Parts II":2}));
([["III",30],["IV",15],["V",8]] as [string,number][]).forEach(([t,s])=>add(asm(t),s,{"Vehicle Parts II":4,"Electronics II":1},{"Vehicle Parts III":2}));
