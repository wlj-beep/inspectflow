export const INITIAL_TOOLS = {
  "t01":{ id:"t01", name:"Outside Micrometer",   type:"Variable",  itNum:"IT-0042" },
  "t02":{ id:"t02", name:"Vernier Caliper",       type:"Variable",  itNum:"IT-0018" },
  "t03":{ id:"t03", name:"Bore Gauge",            type:"Variable",  itNum:"IT-0031" },
  "t04":{ id:"t04", name:"Inside Micrometer",     type:"Variable",  itNum:"IT-0029" },
  "t05":{ id:"t05", name:"Depth Micrometer",      type:"Variable",  itNum:"IT-0055" },
  "t06":{ id:"t06", name:"Height Gauge",          type:"Variable",  itNum:"IT-0011" },
  "t07":{ id:"t07", name:"Profilometer",          type:"Variable",  itNum:"IT-0063" },
  "t08":{ id:"t08", name:"CMM",                   type:"Variable",  itNum:"IT-0001" },
  "t09":{ id:"t09", name:"Plug Gauge",            type:"Go/No-Go",  itNum:"IT-0074" },
  "t10":{ id:"t10", name:"Thread Gauge",          type:"Go/No-Go",  itNum:"IT-0082" },
  "t11":{ id:"t11", name:"Ring Gauge",            type:"Go/No-Go",  itNum:"IT-0091" },
  "t12":{ id:"t12", name:"Snap Gauge",            type:"Go/No-Go",  itNum:"IT-0090" },
  "t13":{ id:"t13", name:"Surface Comparator",    type:"Attribute", itNum:"IT-0044" },
  "t14":{ id:"t14", name:"Optical Comparator",    type:"Attribute", itNum:"IT-0038" },
};

export const INITIAL_PARTS = {
  "1234":{
    partNumber:"1234", description:"Hydraulic Cylinder Body",
    operations:{
      "010":{ label:"Rough Turn", dimensions:[
        { id:"d1", name:"Outer Diameter", nominal:1.0000, tolPlus:0.0050, tolMinus:0.0050, unit:"in", sampling:"first_last", tools:["t01","t02","t08"] },
        { id:"d2", name:"Overall Length",  nominal:2.5000, tolPlus:0.0100, tolMinus:0.0100, unit:"in", sampling:"first_last", tools:["t02","t06"] },
      ]},
      "020":{ label:"Bore & Finish", dimensions:[
        { id:"d3", name:"Bore Diameter",  nominal:0.6250, tolPlus:0.0030, tolMinus:0.0000, unit:"in", sampling:"100pct",    tools:["t03","t04","t09","t08"] },
        { id:"d4", name:"Surface Finish", nominal:32.0,   tolPlus:8.0,    tolMinus:8.0,    unit:"Ra", sampling:"first_last", tools:["t07","t13"] },
      ]},
      "030":{ label:"Thread & Final", dimensions:[
        { id:"d5", name:"Thread Pitch Dia", nominal:0.5000, tolPlus:0.0020, tolMinus:0.0020, unit:"in", sampling:"100pct",    tools:["t10","t08","t14"] },
        { id:"d6", name:"Chamfer Depth",    nominal:0.0620, tolPlus:0.0050, tolMinus:0.0050, unit:"in", sampling:"first_last", tools:["t05","t02"] },
      ]},
    },
  },
};
export const INITIAL_JOBS = {
  "J-10041":{ jobNumber:"J-10041", partNumber:"1234", operation:"010", lot:"Lot A", qty:8,  status:"closed" },
  "J-10042":{ jobNumber:"J-10042", partNumber:"1234", operation:"020", lot:"Lot A", qty:12, status:"open"   },
  "J-10043":{ jobNumber:"J-10043", partNumber:"1234", operation:"030", lot:"Lot A", qty:12, status:"open"   },
  "J-10044":{ jobNumber:"J-10044", partNumber:"1234", operation:"010", lot:"Lot B", qty:5,  status:"draft"  },
};
export const INITIAL_RECORDS = [
  { id:"r001", jobNumber:"J-10041", partNumber:"1234", operation:"010", lot:"Lot A", qty:8,
    timestamp:"2026-03-07 06:42", operator:"J. Morris",
    values:{
      d1_1:"1.0021", d1_2:"1.0018", d1_3:"0.9998", d1_4:"1.0003",
      d1_5:"1.0055", d1_6:"1.0009", d1_7:"0.9991", d1_8:"0.9988",
      d2_1:"2.4982", d2_2:"2.5004", d2_3:"2.4997", d2_4:"2.5011",
      d2_5:"2.4993", d2_6:"2.5006", d2_7:"2.4988", d2_8:"2.5018",
    },
    tools:{ d1:{toolId:"t01",itNum:"IT-0042"}, d2:{toolId:"t02",itNum:"IT-0018"} },
    missingPieces:{}, oot:true, status:"complete",
    comment:"Piece 5 Outer Diameter reads 1.0055 — exceeds +.0050 tolerance by 0.0005. Reviewed with supervisor D. Kowalski. Piece accepted per engineering disposition ENG-2026-031. No corrective action required at this time." },
];
export const INITIAL_USERS = [
  { id:1, name:"J. Morris", role:"Operator", active:true },
  { id:2, name:"R. Tatum", role:"Operator", active:true },
  { id:3, name:"Q. Nguyen", role:"Quality", active:true },
  { id:4, name:"D. Kowalski", role:"Supervisor", active:true },
  { id:5, name:"S. Patel", role:"Operator", active:true },
  { id:6, name:"L. Chen", role:"Operator", active:true },
  { id:7, name:"M. Okafor", role:"Operator", active:true },
  { id:8, name:"T. Brennan", role:"Operator", active:true },
  { id:9, name:"A. Vasquez", role:"Operator", active:true },
  { id:10, name:"S. Admin", role:"Admin", active:true }
];
