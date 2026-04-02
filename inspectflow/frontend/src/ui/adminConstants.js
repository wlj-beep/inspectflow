export const TOOL_TYPES = ["Variable","Go/No-Go","Attribute"];
export const SAMPLING_OPTIONS = [
  { value:"first_last", label:"First & Last" },
  { value:"first_middle_last", label:"First, Middle, Last" },
  { value:"every_5",   label:"Every 5th"    },
  { value:"every_10",  label:"Every 10th"   },
  { value:"100pct",    label:"100%"          },
  { value:"custom_interval", label:"Custom Every Nth" }
];
export const COMMON_TOOL_TEMPLATES = [
  { name:"Outside Micrometer", type:"Variable" },
  { name:"Inside Micrometer", type:"Variable" },
  { name:"Vernier Caliper", type:"Variable" },
  { name:"Depth Micrometer", type:"Variable" },
  { name:"Height Gauge", type:"Variable" },
  { name:"Plug Gauge", type:"Go/No-Go" },
  { name:"Thread Gauge", type:"Go/No-Go" },
  { name:"Ring Gauge", type:"Go/No-Go" },
  { name:"Snap Gauge", type:"Go/No-Go" },
  { name:"Surface Comparator", type:"Attribute" },
  { name:"Optical Comparator", type:"Attribute" }
];
export const ISSUE_CATEGORIES = [
  { value:"part_issue", label:"Part issue" },
  { value:"tolerance_issue", label:"Tolerance issue" },
  { value:"dimension_issue", label:"Dimension issue" },
  { value:"operation_mapping_issue", label:"Wrong operation-stage mapping" },
  { value:"app_functionality_issue", label:"App/functionality issue" },
  { value:"tool_issue", label:"Tool issue" },
  { value:"sampling_issue", label:"Sampling-plan issue" },
  { value:"other", label:"Other" }
];
export const MISSING_REASONS = ["Scrapped","Lost","Damaged","Unable to Measure","Other"];
export const OPERATOR_NAMES  = ["J. Morris","R. Tatum","D. Kowalski","S. Patel","L. Chen","M. Okafor","T. Brennan","A. Vasquez"];

export function getSamplePieces(plan,qty,samplingInterval){
  if(qty<=0) return [];
  switch(plan){
    case "first_last": return qty===1?[1]:[1,qty];
    case "first_middle_last": {
      const middle=Math.floor((qty+1)/2);
      return Array.from(new Set([1,middle,qty])).sort((a,b)=>a-b);
    }
    case "every_5":  { const p=[]; for(let i=1;i<=qty;i+=5)p.push(i); if(p[p.length-1]!==qty)p.push(qty); return p; }
    case "every_10": { const p=[]; for(let i=1;i<=qty;i+=10)p.push(i); if(p[p.length-1]!==qty)p.push(qty); return p; }
    case "custom_interval": {
      const n=Math.max(1, Number(samplingInterval)||1);
      const p=[];
      for(let i=1;i<=qty;i+=n) p.push(i);
      if(p[p.length-1]!==qty) p.push(qty);
      return p;
    }
    default: return Array.from({length:qty},(_,i)=>i+1);
  }
}
export function samplingLabel(v,samplingInterval){
  if(v==="custom_interval"){
    const n=Math.max(1, Number(samplingInterval)||1);
    return `Every ${n}${n===1?"st":n===2?"nd":n===3?"rd":"th"}`;
  }
  return SAMPLING_OPTIONS.find(o=>o.value===v)?.label??v;
}
