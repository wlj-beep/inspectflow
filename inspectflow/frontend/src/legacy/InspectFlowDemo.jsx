import React, { useState, useRef, useEffect } from "react";
import { api } from "../api/index.js";

const TOOL_TYPES = ["Variable","Go/No-Go","Attribute"];
const SAMPLING_OPTIONS = [
  { value:"first_last", label:"First & Last" },
  { value:"first_middle_last", label:"First, Middle, Last" },
  { value:"every_5",   label:"Every 5th"    },
  { value:"every_10",  label:"Every 10th"   },
  { value:"100pct",    label:"100%"          },
  { value:"custom_interval", label:"Custom Every Nth" }
];
const CAPABILITY_DEFS = [
  { key:"view_operator", label:"Operator View", desc:"Access measurement entry" },
  { key:"submit_records", label:"Submit Records", desc:"Submit inspection results" },
  { key:"view_admin", label:"Admin Area", desc:"Access admin screens" },
  { key:"view_jobs", label:"View Jobs", desc:"View job management list" },
  { key:"manage_jobs", label:"Manage Jobs", desc:"Create or modify jobs" },
  { key:"view_records", label:"View Records", desc:"View inspection records" },
  { key:"edit_records", label:"Edit Records", desc:"Supervisor edits with audit log" },
  { key:"manage_parts", label:"Manage Parts", desc:"Edit parts/operations/dimensions" },
  { key:"manage_tools", label:"Manage Tools", desc:"Add/edit tool library" },
  { key:"manage_users", label:"Manage Users", desc:"Add/edit users" },
  { key:"manage_roles", label:"Manage Roles", desc:"Edit role permissions" }
];
const DEFAULT_ROLE_CAPS = {
  Operator: ["view_operator","submit_records","view_records"],
  Quality: ["view_admin","view_jobs","view_records","edit_records"],
  Supervisor: ["view_admin","view_jobs","manage_jobs","view_records","edit_records"],
  Admin: ["view_admin","view_jobs","manage_jobs","view_records","edit_records","manage_parts","manage_tools","manage_users","manage_roles"]
};
const COMMON_TOOL_TEMPLATES = [
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
const ISSUE_CATEGORIES = [
  { value:"part_issue", label:"Part issue" },
  { value:"tolerance_issue", label:"Tolerance issue" },
  { value:"dimension_issue", label:"Dimension issue" },
  { value:"operation_mapping_issue", label:"Wrong operation-stage mapping" },
  { value:"app_functionality_issue", label:"App/functionality issue" },
  { value:"tool_issue", label:"Tool issue" },
  { value:"sampling_issue", label:"Sampling-plan issue" },
  { value:"other", label:"Other" }
];
function getSamplePieces(plan,qty,samplingInterval){
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
function samplingLabel(v,samplingInterval){
  if(v==="custom_interval"){
    const n=Math.max(1, Number(samplingInterval)||1);
    return `Every ${n}${n===1?"st":n===2?"nd":n===3?"rd":"th"}`;
  }
  return SAMPLING_OPTIONS.find(o=>o.value===v)?.label??v;
}
const MISSING_REASONS = ["Scrapped","Lost","Damaged","Unable to Measure","Other"];
const OPERATOR_NAMES  = ["J. Morris","R. Tatum","D. Kowalski","S. Patel","L. Chen","M. Okafor","T. Brennan","A. Vasquez"];

const INITIAL_TOOLS = {
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

const INITIAL_PARTS = {
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
const INITIAL_JOBS = {
  "J-10041":{ jobNumber:"J-10041", partNumber:"1234", operation:"010", lot:"Lot A", qty:8,  status:"closed" },
  "J-10042":{ jobNumber:"J-10042", partNumber:"1234", operation:"020", lot:"Lot A", qty:12, status:"open"   },
  "J-10043":{ jobNumber:"J-10043", partNumber:"1234", operation:"030", lot:"Lot A", qty:12, status:"open"   },
  "J-10044":{ jobNumber:"J-10044", partNumber:"1234", operation:"010", lot:"Lot B", qty:5,  status:"draft"  },
};
const INITIAL_RECORDS = [
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
const INITIAL_USERS = [
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

function isOOT(value,tolPlus,tolMinus,nominal){
  if(value===undefined||value===null||value==="") return null;
  const s=String(value);
  if(s.includes("|")){
    const [minStr,maxStr]=s.split("|");
    const minVal=parseFloat(minStr);
    const maxVal=parseFloat(maxStr);
    const hasMin=!isNaN(minVal);
    const hasMax=!isNaN(maxVal);
    if(!hasMin && !hasMax) return null;
    if(hasMin && minVal < nominal - tolMinus) return true;
    if(hasMax && maxVal > nominal + tolPlus) return true;
    return false;
  }
  const v=parseFloat(s);
  if(isNaN(v)) return null;
  return (v>nominal+tolPlus)||(v<nominal-tolMinus);
}
function formatValue(value, dim){
  if(value===undefined||value===null||value==="") return "";
  const s=String(value);
  if(s.includes("|")){
    const [minStr,maxStr]=s.split("|");
    const dec=dim?.unit==="Ra"?1:4;
    const fmt=(v)=>v===""?"":(isNaN(parseFloat(v))?v:parseFloat(v).toFixed(dec));
    const min=fmt(minStr||"");
    const max=fmt(maxStr||"");
    if(min&&max) return `${min}–${max}`;
    return min||max||"";
  }
  if(s==="PASS"||s==="FAIL") return s;
  const dec=dim?.unit==="Ra"?1:4;
  const num=parseFloat(s);
  if(isNaN(num)) return s;
  return num.toFixed(dec);
}
function splitRangeValue(value){
  if(!value || !String(value).includes("|")) return ["",""];
  const [minRaw,maxRaw]=String(value).split("|");
  return [minRaw || "", maxRaw || ""];
}
function isValidNonNegativeNumber(value){
  if(value===undefined || value===null || String(value).trim()==="") return false;
  const n=Number(value);
  return Number.isFinite(n) && n >= 0;
}

class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={ hasError:false, error:null };
  }
  static getDerivedStateFromError(error){
    return { hasError:true, error };
  }
  componentDidCatch(err){
    console.error("UI Error:", err);
  }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:"2rem"}}>
          <div className="card">
            <div className="card-head"><div className="card-title">Something went wrong</div></div>
            <div className="card-body">
              <p className="text-muted" style={{marginBottom:"1rem"}}>An unexpected UI error occurred. Try refreshing the page.</p>
              <button className="btn btn-primary" onClick={()=>window.location.reload()}>Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
function fmtSpec(dim){
  const dec=dim.unit==="Ra"?1:4;
  const n=parseFloat(dim.nominal).toFixed(dec);
  const p=parseFloat(dim.tolPlus).toFixed(dec);
  const m=parseFloat(dim.tolMinus).toFixed(dec);
  return p===m?`${n} \u00b1${p} ${dim.unit}`:`${n} +${p}/\u2212${m} ${dim.unit}`;
}
function uid(){ return Math.random().toString(36).slice(2,8); }
function nowStr(){ return new Date().toISOString().slice(0,16).replace("T"," "); }
function fmtTs(ts){
  if(!ts)return "";
  const d=new Date(ts);
  if(isNaN(d)) return String(ts).slice(0,16).replace("T"," ");
  return d.toISOString().slice(0,16).replace("T"," ");
}
function normalizeOpNumber(value){
  const raw=String(value ?? "").trim();
  if(!/^\d{1,3}$/.test(raw)) return null;
  const n=Number(raw);
  if(!Number.isInteger(n) || n < 1 || n > 999) return null;
  return String(n).padStart(3,"0");
}
function revisionCodeToIndex(value){
  const code=String(value||"").trim().toUpperCase();
  if(!/^[A-Z]+$/.test(code)) return null;
  let idx=0;
  for(const ch of code){
    idx=(idx*26)+(ch.charCodeAt(0)-64);
  }
  return idx;
}
function revisionIndexToCode(value){
  let n=Number(value);
  if(!Number.isInteger(n) || n<=0) return null;
  let out="";
  while(n>0){
    n-=1;
    out=String.fromCharCode(65+(n%26))+out;
    n=Math.floor(n/26);
  }
  return out;
}
function nextRevisionCode(value){
  const idx=revisionCodeToIndex(value);
  if(!idx) return "A";
  return revisionIndexToCode(idx+1) || "A";
}
function isToolSelectable(t){
  if(!t) return false;
  return t.active !== false && t.visible !== false;
}

function mapToolLibrary(apiTools){
  const out={};
  for(const t of apiTools||[]){
    const id=String(t.id);
    out[id]={
      id,
      name:t.name,
      type:t.type,
      itNum:t.it_num ?? t.itNum,
      size:t.size ?? "",
      calibrationDueDate:t.calibration_due_date ?? t.calibrationDueDate ?? "",
      currentLocationId:t.current_location_id ?? t.currentLocationId ?? null,
      currentLocationName:t.current_location_name ?? t.currentLocationName ?? "",
      currentLocationType:t.current_location_type ?? t.currentLocationType ?? "",
      homeLocationId:t.home_location_id ?? t.homeLocationId ?? null,
      homeLocationName:t.home_location_name ?? t.homeLocationName ?? "",
      homeLocationType:t.home_location_type ?? t.homeLocationType ?? "",
      active:t.active ?? true,
      visible:t.visible ?? true
    };
  }
  return out;
}

function mapToolLocations(apiLocations){
  return (apiLocations||[]).map((loc)=>({
    id:Number(loc.id),
    name:loc.name,
    locationType:loc.location_type ?? loc.locationType
  }));
}

function buildPartsFromApi(partDetails){
  const partsObj={};
  const opIdToNumber={};
  for(const part of partDetails||[]){
    const opsObj={};
    for(const op of part.operations||[]){
      const normalizedOp=normalizeOpNumber(op.opNumber) || String(op.opNumber);
      opIdToNumber[String(op.id)]=normalizedOp;
      const dims=(op.dimensions||[]).map(d=>({
        id:String(d.id),
        name:d.name,
        nominal:Number(d.nominal),
        tolPlus:Number(d.tolPlus ?? d.tol_plus),
        tolMinus:Number(d.tolMinus ?? d.tol_minus),
        unit:d.unit,
        sampling:d.sampling,
        samplingInterval:Number(d.samplingInterval ?? d.sampling_interval) || null,
        inputMode:d.input_mode ?? d.inputMode ?? "single",
        tools:(d.toolIds||d.tools?.map(t=>t.id)||[]).map(id=>String(id))
      }));
      opsObj[normalizedOp]={ id:String(op.id), label:op.label, dimensions:dims };
    }
    const currentRevision=part.selectedRevision || part.currentRevision || null;
    partsObj[part.id]={
      partNumber:part.id,
      description:part.description,
      currentRevision,
      nextRevision:part.nextRevision || (currentRevision ? nextRevisionCode(currentRevision) : "A"),
      revisions:Array.isArray(part.revisions) ? part.revisions : [],
      readOnlyRevision:!!part.readOnlyRevision,
      operations:opsObj
    };
  }
  return { partsObj, opIdToNumber };
}

function mapJobsFromApi(apiJobs, opIdToNumber){
  const out={};
  for(const j of apiJobs||[]){
    const rawOp=opIdToNumber[String(j.operation_id)]||String(j.operation_id);
    const opNum=normalizeOpNumber(rawOp) || String(rawOp);
    out[j.id]={
      jobNumber:j.id,
      partNumber:j.part_id,
      partRevision:j.part_revision_code || j.partRevision || "A",
      operation:opNum,
      operationId:j.operation_id,
      lot:j.lot,
      qty:j.qty,
      status:j.status,
      lockOwnerUserId:j.lock_owner_user_id || null,
      lockTimestamp:j.lock_timestamp || null
    };
  }
  return out;
}

function mapRecordsFromApi(apiRecords, opIdToNumber, usersById){
  return (apiRecords||[]).map(r=>({
    id:String(r.id),
    jobNumber:r.job_id,
    partNumber:r.part_id,
    operation:opIdToNumber[String(r.operation_id)]||String(r.operation_id),
    lot:r.lot,
    qty:r.qty,
    timestamp:fmtTs(r.timestamp),
    operator:usersById?.[String(r.operator_user_id)]||"",
    operatorUserId:r.operator_user_id,
    values:{},
    tools:{},
    missingPieces:{},
    oot:!!r.oot,
    status:r.status,
    comment:r.comment||""
  }));
}

function mapRecordDetailFromApi(r, opIdToNumber, usersById){
  const values={};
  for(const v of r.values||[]){
    values[`${v.dimension_id}_${v.piece_number}`]=v.value;
  }
  const tools={};
  for(const t of r.tools||[]){
    const dimId=String(t.dimension_id);
    if(!tools[dimId]) tools[dimId]=[];
    tools[dimId].push({
      toolId:String(t.tool_id),
      itNum:t.it_num,
      toolName:t.tool_name,
      toolType:t.tool_type
    });
  }
  const missingPieces={};
  for(const m of r.missingPieces||[]){
    missingPieces[String(m.piece_number)]={ reason:m.reason, ncNum:m.nc_num, details:m.details };
  }
  const opNumber=opIdToNumber?.[String(r.operation_id)]||String(r.operation_id||"");
  const auditLog=(r.auditLog||[]).map(a=>({
    id:String(a.id),
    userId:a.user_id,
    userName:usersById?.[String(a.user_id)]||`User #${a.user_id}`,
    field:a.field,
    beforeValue:a.before_value,
    afterValue:a.after_value,
    reason:a.reason,
    timestamp:fmtTs(a.timestamp)
  }));
  return {
    id:String(r.id),
    jobNumber:r.job_id,
    partNumber:r.part_id,
    operation:opNumber,
    lot:r.lot,
    qty:r.qty,
    timestamp:fmtTs(r.timestamp),
    operator:usersById?.[String(r.operator_user_id)]||"",
    operatorUserId:r.operator_user_id,
    values,
    tools,
    missingPieces,
    oot:!!r.oot,
    status:r.status,
    comment:r.comment||"",
    auditLog
  };
}

function getOperatorName(record, usersById){
  if(!record) return "";
  if(record.operator) return record.operator;
  const id = record.operatorUserId ?? record.operator_user_id;
  return usersById?.[String(id)] || (id ? `User #${id}` : "");
}

function TypeBadge({ type, small }){
  const s=small?{fontSize:".58rem",padding:".08rem .3rem"}:{};
  if(type==="Go/No-Go") return <span className="tbadge tbadge-gng" style={s}>Go/No-Go</span>;
  if(type==="Attribute") return <span className="tbadge tbadge-attr" style={s}>Attribute</span>;
  return <span className="tbadge tbadge-var" style={s}>Variable</span>;
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1017;--surface:#141820;--panel:#1a1f2c;--panel2:#1f2535;
  --border:#252d40;--border2:#2e3a52;--text:#c8d0e4;--muted:#5a6480;
  --accent:#d4891a;--accent2:#f0a830;--ok:#27c76a;--warn:#e03535;
  --info:#2e88d4;--draft:#9b6fd4;--incomplete:#d4a017;
  --mono:'Share Tech Mono',monospace;--sans:'Barlow',sans-serif;--cond:'Barlow Condensed',sans-serif;
}
html,body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;font-size:15px}
.app-header{background:var(--surface);border-bottom:2px solid var(--accent);padding:0 1.75rem;display:flex;align-items:center;gap:1.5rem;height:54px;position:sticky;top:0;z-index:200}
.logo{font-family:var(--cond);font-size:1.1rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--accent2);display:flex;align-items:center;gap:.5rem}
.logo-icon{width:22px;height:22px;position:relative;flex-shrink:0}
.logo-icon::before{content:"";position:absolute;inset:2px;border:2px solid var(--accent);border-radius:2px}
.logo-icon::after{content:"";position:absolute;width:8px;height:8px;background:var(--accent);top:50%;left:50%;transform:translate(-50%,-50%)}
.header-sep{width:1px;height:22px;background:var(--border2)}
.header-sub{font-size:.68rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.header-right{margin-left:auto;display:flex;align-items:center;gap:1rem}
.user-ctrl{display:flex;flex-direction:column;gap:.15rem;min-width:220px}
.user-ctrl-label{font-size:.58rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.user-ctrl-row{display:flex;align-items:center;gap:.4rem}
.role-chip{font-family:var(--mono);font-size:.65rem;padding:.12rem .4rem;border-radius:2px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;background:#1b2434;border:1px solid var(--border2);color:var(--text)}
.role-operator{color:var(--ok);border-color:#1a5c38}
.role-quality{color:var(--info);border-color:#1e4a6e}
.role-supervisor{color:var(--incomplete);border-color:#5a4010}
.role-admin{color:var(--accent2);border-color:var(--accent)}
.data-chip{font-family:var(--mono);font-size:.6rem;padding:.14rem .45rem;border-radius:2px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;border:1px solid var(--border2);background:var(--panel2);color:var(--muted)}
.data-live{color:var(--ok);border-color:#1a5c38;background:#0b2318}
.data-loading{color:var(--info);border-color:#1e4a6e;background:#0d1f2e}
.data-fallback{color:var(--warn);border-color:#6b2020;background:#2a0d0d}
.user-ctrl-hint{font-size:.62rem;color:var(--muted)}
.nav{display:flex}
.nav-btn{background:none;border:none;cursor:pointer;font-family:var(--cond);font-size:.82rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:.4rem 1.1rem;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s}
.nav-btn:hover{color:var(--text)}.nav-btn.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.page{padding:1.75rem;max-width:1100px;margin:0 auto}
.transition-banner{display:flex;align-items:center;gap:.55rem;padding:.55rem .8rem;margin:0 auto 1rem;border:1px solid var(--border2);border-left-width:3px;border-radius:3px;font-size:.78rem}
.transition-banner .transition-label{font-family:var(--cond);font-size:.66rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.transition-loading{background:#0d1f2e;border-color:#1e4a6e;color:var(--info)}
.transition-success{background:#0b2318;border-color:#1a5c38;color:var(--ok)}
.transition-error{background:#2a0d0d;border-color:#6b2020;color:var(--warn)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:3px;margin-bottom:1rem}
.card-head{padding:.65rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--panel);border-radius:3px 3px 0 0}
.card-title{font-family:var(--cond);font-size:.72rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.card-body{padding:1.25rem}
.field{display:flex;flex-direction:column;gap:.3rem}
.field label{font-size:.68rem;color:var(--muted);letter-spacing:.1em;text-transform:uppercase}
input,select,textarea{width:100%;background:var(--panel2);border:1px solid var(--border2);color:var(--text);font-family:var(--sans);font-size:.88rem;padding:.5rem .7rem;border-radius:2px;outline:none;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:var(--accent)}
textarea{resize:vertical;min-height:68px;font-size:.84rem}
select option{background:var(--panel2)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem}
.ac-wrap{position:relative}
.ac-list{position:absolute;top:100%;left:0;right:0;background:var(--panel);border:1px solid var(--accent);border-top:none;border-radius:0 0 3px 3px;z-index:400;max-height:200px;overflow-y:auto}
.ac-item{padding:.45rem .75rem;font-size:.84rem;cursor:pointer;transition:background .1s}
.ac-item:hover,.ac-item.hi{background:var(--panel2);color:var(--accent2)}
.ac-sub{font-size:.7rem;color:var(--muted);margin-top:.1rem;font-family:var(--mono)}
.btn{display:inline-flex;align-items:center;gap:.35rem;font-family:var(--cond);font-size:.8rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:.5rem 1.25rem;border-radius:2px;cursor:pointer;border:none;transition:all .15s;white-space:nowrap}
.btn:disabled{opacity:.35;cursor:not-allowed}
.btn-primary{background:var(--accent);color:#000}.btn-primary:not(:disabled):hover{background:var(--accent2)}
.btn-ghost{background:var(--panel2);color:var(--text);border:1px solid var(--border2)}.btn-ghost:hover{border-color:var(--accent);color:var(--accent2)}
.btn-draft{background:var(--panel2);color:var(--draft);border:1px solid var(--draft)}.btn-draft:hover{background:#1e1530}
.btn-partial{background:var(--panel2);color:var(--incomplete);border:1px solid var(--incomplete)}.btn-partial:hover{background:#1e1a0a}
.btn-danger{background:transparent;color:var(--warn);border:1px solid #6b2020}.btn-danger:hover{background:#2a0d0d}
.btn-sm{padding:.28rem .65rem;font-size:.7rem}
.btn-xs{padding:.18rem .45rem;font-size:.65rem}
.job-strip{background:var(--panel);border:1px solid var(--border2);border-left:3px solid var(--accent);border-radius:3px;padding:.85rem 1.25rem;display:flex;flex-wrap:wrap;gap:2rem;align-items:center;margin-bottom:1rem}
.strip-field{display:flex;flex-direction:column;gap:.15rem}
.strip-label{font-size:.62rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.strip-val{font-family:var(--mono);font-size:.9rem;color:var(--accent2)}
.meas-scroll{overflow-x:auto}
.meas-table{border-collapse:collapse;font-size:.82rem;table-layout:fixed}
.meas-table .rl{width:118px;background:var(--panel);border-right:2px solid var(--border2);font-family:var(--cond);font-size:.67rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:.42rem .85rem;white-space:nowrap;text-align:right;vertical-align:middle}
.meas-table .dc{width:160px;border-right:1px solid var(--border);vertical-align:top;overflow:hidden}
.meas-table .dc:last-child{border-right:none}
.meas-table .hrow td{border-bottom:1px solid var(--border);vertical-align:top}
.dim-hdr{padding:.55rem .7rem .35rem}
.dim-hdr-name{font-family:var(--cond);font-size:.8rem;font-weight:700;color:var(--text);letter-spacing:.04em;word-break:break-word}
.dim-hdr-spec{font-family:var(--mono);font-size:.68rem;color:var(--muted);margin-top:.15rem}
.hdr-cell{padding:.3rem .6rem;vertical-align:middle}
.hdr-inp{width:100%;background:var(--panel);border:1px solid var(--border2);color:var(--text);font-family:var(--sans);font-size:.78rem;padding:.32rem .5rem;border-radius:2px;outline:none;transition:border-color .15s}
.hdr-inp:focus{border-color:var(--accent)}
.hdr-inp.mf{font-family:var(--mono);font-size:.75rem}
.tag-cell{padding:.32rem .6rem;vertical-align:middle}
.sample-tag{display:inline-block;font-family:var(--mono);font-size:.62rem;background:var(--panel2);border:1px solid var(--border2);color:var(--info);padding:.1rem .35rem;border-radius:2px;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em;margin-right:.2rem;margin-bottom:.2rem}
.gauge-tag{display:inline-block;font-family:var(--mono);font-size:.62rem;background:#1a0d2e;border:1px solid #5a3080;color:#b080f0;padding:.1rem .35rem;border-radius:2px;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.2rem}
.range-tag{display:inline-block;font-family:var(--mono);font-size:.62rem;background:#0d1f2e;border:1px solid #1e4a6e;color:#6fb0f0;padding:.1rem .35rem;border-radius:2px;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.2rem}
.meas-table .div-row td{border-bottom:2px solid var(--accent) !important;padding:0 !important;height:2px;line-height:0;font-size:0}
.meas-table .pr td{padding:.26rem .4rem;border-bottom:1px solid var(--border);vertical-align:middle}
.meas-table .pr:last-child td{border-bottom:none}
.meas-table .pr:hover td{background:rgba(255,255,255,.018)}
.meas-table .pr.mr td{background:#180d0d}
.vi{font-family:var(--mono) !important;font-size:.86rem !important;text-align:center !important;padding:.28rem .3rem !important;background:var(--panel2) !important;width:100%;display:block}
.vi.ok{border-color:var(--ok) !important;color:var(--ok)}
.vi.oot{border-color:var(--warn) !important;color:var(--warn)}
.vi.ux{border-color:var(--info) !important;border-style:dashed !important}
.na-btn{display:block;width:100%;background:none;border:1px dashed var(--border2);color:var(--border2);border-radius:2px;padding:.24rem .3rem;font-family:var(--mono);font-size:.78rem;cursor:pointer;transition:all .15s;text-align:center}
.na-btn:hover{border-color:var(--info);color:var(--info)}
.ue-wrap{display:flex;align-items:center;gap:.2rem}
.ue-wrap .vi{flex:1}
.relock-btn{background:none;border:none;cursor:pointer;color:var(--muted);font-size:.85rem;line-height:1;padding:.1rem;flex-shrink:0}.relock-btn:hover{color:var(--warn)}
.pf-wrap{display:flex;gap:.2rem}
.pf-btn{flex:1;padding:.24rem .1rem;border-radius:2px;font-family:var(--cond);font-size:.67rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;border:1px solid var(--border2);background:var(--panel2);color:var(--muted);transition:all .15s}
.pf-btn.pass-on{background:#0b2318;border-color:var(--ok);color:var(--ok)}
.pf-btn.fail-on{background:#2a0d0d;border-color:var(--warn);color:var(--warn)}
.mp-tag{display:inline-flex;align-items:center;font-size:.6rem;color:var(--warn);font-family:var(--mono);background:#2a0d0d;border:1px solid #6b2020;border-radius:2px;padding:.08rem .3rem;margin-top:.15rem;white-space:nowrap}
.tbadge{display:inline-block;font-family:var(--mono);font-size:.65rem;padding:.12rem .4rem;border-radius:2px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.tbadge-var{background:#0d1f2e;color:var(--info);border:1px solid #1e4a6e}
.tbadge-gng{background:#1a0d2e;color:#b080f0;border:1px solid #5a3080}
.tbadge-attr{background:#1a1208;color:var(--incomplete);border:1px solid #5a4010}
.tool-search-wrap{position:relative}
.tool-popover{position:absolute;top:calc(100% + 4px);left:0;min-width:290px;background:var(--surface);border:1px solid var(--accent);border-radius:3px;z-index:500;box-shadow:0 8px 24px rgba(0,0,0,.55);padding:.65rem}
.tool-pop-filters{display:flex;gap:.35rem;margin-bottom:.5rem;flex-wrap:wrap}
.tpf-btn{background:var(--panel2);border:1px solid var(--border2);color:var(--muted);font-family:var(--cond);font-size:.65rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:.2rem .55rem;border-radius:2px;cursor:pointer;transition:all .15s}
.tpf-btn.on{border-color:var(--accent);color:var(--accent2);background:var(--panel)}
.tool-pop-list{max-height:175px;overflow-y:auto;display:flex;flex-direction:column;gap:.22rem}
.tool-pop-item{display:flex;align-items:center;justify-content:space-between;padding:.3rem .5rem;background:var(--panel);border:1px solid var(--border2);border-radius:2px;cursor:pointer;transition:background .1s}
.tool-pop-item:hover{background:var(--panel2)}
.tool-pop-item.added{border-color:#1a5c38;cursor:default}
.tpi-name{font-size:.8rem;color:var(--text)}
.tpi-it{font-family:var(--mono);font-size:.68rem;color:var(--muted)}
.dim-tool-list{display:flex;flex-wrap:wrap;gap:.25rem;margin-bottom:.4rem;min-height:10px}
.dim-tool-tag{display:inline-flex;align-items:center;gap:.3rem;background:var(--panel2);border:1px solid var(--border2);border-radius:2px;padding:.15rem .45rem;font-size:.75rem;color:var(--text)}
.dim-tool-tag .rm{background:none;border:none;cursor:pointer;color:var(--muted);font-size:.78rem;line-height:1}.dim-tool-tag .rm:hover{color:var(--warn)}
.badge{display:inline-flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:.63rem;letter-spacing:.05em;padding:.15rem .45rem;border-radius:2px;text-transform:uppercase;white-space:nowrap}
.badge-ok{background:#0b2318;color:var(--ok);border:1px solid #1a5c38}
.badge-oot{background:#2a0d0d;color:var(--warn);border:1px solid #6b2020}
.badge-open{background:#0d1f2e;color:var(--info);border:1px solid #1e4a6e}
.badge-closed{background:var(--panel2);color:var(--muted);border:1px solid var(--border2)}
.badge-draft{background:#1a1030;color:var(--draft);border:1px solid var(--draft)}
.badge-incomplete{background:#1e1a0a;color:var(--incomplete);border:1px solid var(--incomplete)}
.badge-pend{background:var(--panel2);color:var(--muted);border:1px solid var(--border)}
.oot-banner{background:#200e0e;border:1px solid #6b2020;border-left:3px solid var(--warn);border-radius:3px;padding:.9rem 1.25rem;display:flex;gap:.9rem;align-items:flex-start;margin-bottom:1rem}
.oot-icon{color:var(--warn);font-size:1.1rem;flex-shrink:0}
.oot-title{font-family:var(--cond);font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--warn)}
.oot-body{font-size:.76rem;color:#a07070;margin-top:.2rem;line-height:1.5}
.inc-banner{background:#1a1208;border:1px solid #5a4010;border-left:3px solid var(--incomplete);border-radius:3px;padding:.9rem 1.25rem;margin-bottom:1rem}
.inc-title{font-family:var(--cond);font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--incomplete);margin-bottom:.5rem}
.banner{padding:.65rem .9rem;border-radius:3px;border:1px solid var(--border2);font-size:.8rem}
.banner.warn{background:#1a1208;border-color:#5a4010;color:#d6b16c}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:600;display:flex;align-items:center;justify-content:center;padding:1rem}
.modal{background:var(--surface);border:1px solid var(--border2);border-top:2px solid var(--accent);border-radius:4px;width:100%;max-width:500px;padding:1.5rem;max-height:90vh;overflow-y:auto}
.modal-title{font-family:var(--cond);font-size:1rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent2);margin-bottom:1.25rem}
.success-card{background:#0a1e12;border:1px solid #1a5c38;border-left:3px solid var(--ok);border-radius:3px;padding:2rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.75rem}
.success-title{font-family:var(--cond);font-size:1.1rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ok)}
.draft-card{background:#120e1e;border:1px solid var(--draft);border-left:3px solid var(--draft);border-radius:3px;padding:2rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.75rem}
.draft-title{font-family:var(--cond);font-size:1.1rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--draft)}
.sub-tabs{display:flex;border-bottom:1px solid var(--border2);margin-bottom:1.25rem}
.sub-tab{background:none;border:none;cursor:pointer;font-family:var(--cond);font-size:.78rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:.55rem 1.2rem;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s,border-color .15s}
.sub-tab.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.sub-tab:hover:not(.active){color:var(--text)}
.data-table{width:100%;border-collapse:collapse;font-size:.8rem}
.data-table thead th{font-family:var(--cond);font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:.5rem .85rem;text-align:left;border-bottom:1px solid var(--border2);background:var(--panel)}
.data-table tbody tr{border-bottom:1px solid var(--border);transition:background .1s}
.data-table tbody tr:hover{background:var(--panel)}
.data-table tbody td{padding:.5rem .85rem;vertical-align:middle}
.edit-table{width:100%;border-collapse:collapse;font-size:.8rem}
.edit-table th{font-family:var(--cond);font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:.45rem .6rem;text-align:left;border-bottom:1px solid var(--border2);background:var(--panel);white-space:nowrap}
.edit-table td{padding:.35rem .4rem;border-bottom:1px solid var(--border);vertical-align:middle}
.edit-table tr:last-child td{border-bottom:none}
.edit-table input,.edit-table select{padding:.28rem .45rem;font-size:.78rem;background:var(--panel);border:1px solid var(--border2)}
.mt1{margin-top:.75rem}.mt2{margin-top:1.25rem}
.gap1{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}
.text-muted{color:var(--muted);font-size:.78rem}
.text-warn{color:var(--warn)}.text-ok{color:var(--ok)}
.mono{font-family:var(--mono) !important}.accent-text{color:var(--accent2) !important}
.section-label{font-family:var(--cond);font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--info);margin-bottom:.6rem}
.empty-state{padding:2.5rem;text-align:center;color:var(--muted);font-size:.82rem}
.tr-click{cursor:pointer}
.err-text{color:var(--warn);font-size:.75rem;margin-top:.3rem}
.search-inp{background:var(--panel2);border:1px solid var(--border2);color:var(--text);font-family:var(--sans);font-size:.84rem;padding:.4rem .65rem;border-radius:2px;outline:none;transition:border-color .15s;width:100%}
.search-inp:focus{border-color:var(--accent)}
.rec-modal{background:var(--surface);border:1px solid var(--border2);border-top:2px solid var(--accent);border-radius:4px;width:100%;max-width:820px;padding:0;max-height:92vh;overflow:hidden;display:flex;flex-direction:column}
.rec-modal-head{padding:1rem 1.5rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.rec-modal-body{overflow-y:auto;padding:1.25rem 1.5rem;flex:1}
.rec-strip{display:flex;flex-wrap:wrap;gap:1.5rem;padding:.85rem 1.25rem;background:var(--panel);border:1px solid var(--border2);border-left:3px solid var(--accent);border-radius:3px;margin-bottom:1.1rem}
.rec-field{display:flex;flex-direction:column;gap:.12rem}
.rec-label{font-size:.6rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.rec-val{font-family:var(--mono);font-size:.85rem;color:var(--accent2)}
.det-table{width:100%;border-collapse:collapse;font-size:.8rem}
.det-table th{font-family:var(--cond);font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:.4rem .65rem;text-align:left;border-bottom:1px solid var(--border2);background:var(--panel);white-space:nowrap}
.det-table td{padding:.38rem .65rem;border-bottom:1px solid var(--border);vertical-align:middle}
.det-table tr:last-child td{border-bottom:none}
.det-table .val-ok{font-family:var(--mono);font-size:.82rem;color:var(--ok)}
.det-table .val-oot{font-family:var(--mono);font-size:.82rem;color:var(--warn);font-weight:700}
.det-table .val-na{font-family:var(--mono);font-size:.78rem;color:var(--border2)}
.det-table .val-edit{outline:2px solid var(--accent2);outline-offset:-2px;border-radius:2px}
.det-section{font-family:var(--cond);font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--info);padding:.6rem 0 .35rem;border-bottom:1px solid var(--border2);margin-bottom:.5rem}
.it-reminder{font-family:var(--mono);font-size:.68rem;color:var(--info);margin-top:.22rem;padding:.1rem .35rem;background:#0d1f2e;border:1px solid #1e4a6e;border-radius:2px;display:inline-block}
.meas-table .dc{position:relative}
.ux-hint{font-size:.88rem !important;line-height:1.45 !important;color:#9eb7cf !important}
.col-resize{position:absolute;top:0;right:0;width:5px;height:100%;cursor:col-resize;z-index:10;background:transparent;user-select:none}
.col-resize:hover,.col-resize.dragging{background:var(--accent)}
`;

function AutocompleteInput({ value, onChange, options, placeholder, style, renderOption, filterFn }) {
  const [open,setOpen]=useState(false);
  const [cursor,setCursor]=useState(-1);
  const ref=useRef();
  const filtered=options.filter(o=>filterFn?filterFn(o,value):o.toLowerCase().includes(value.toLowerCase()));
  const show=open&&filtered.length>0&&value.length>0;
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  function pick(v){onChange(v);setOpen(false);setCursor(-1);}
  return (
    <div className="ac-wrap" ref={ref}>
      <input value={value} placeholder={placeholder} style={style} autoComplete="off"
        onChange={e=>{onChange(e.target.value);setOpen(true);setCursor(-1);}}
        onFocus={()=>setOpen(true)}
        onKeyDown={e=>{
          if(!show)return;
          if(e.key==="ArrowDown"){e.preventDefault();setCursor(c=>Math.min(c+1,filtered.length-1));}
          if(e.key==="ArrowUp"){e.preventDefault();setCursor(c=>Math.max(c-1,0));}
          if(e.key==="Enter"&&cursor>=0){e.preventDefault();const o=filtered[cursor];pick(typeof o==="object"?o.value:o);}
          if(e.key==="Escape")setOpen(false);
        }} />
      {show&&(
        <div className="ac-list">
          {filtered.map((o,i)=>{
            const v=typeof o==="object"?o.value:o;
            return <div key={v} className={`ac-item${cursor===i?" hi":""}`} onMouseDown={()=>pick(v)}>
              {renderOption?renderOption(o):<span>{v}</span>}
            </div>;
          })}
        </div>
      )}
    </div>
  );
}

function ToolSearchPopover({ toolLibrary, selectedIds, onAdd, onRemove }) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState("");
  const [tf,setTf]=useState("All");
  const ref=useRef();
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  const filtered=Object.values(toolLibrary).filter(t=>{
    if(!isToolSelectable(t)) return false;
    const hay=[t.name,t.itNum,t.size].filter(Boolean).join(" ").toLowerCase();
    const ms=!search||hay.includes(search.toLowerCase());
    return ms&&(tf==="All"||t.type===tf);
  });
  return (
    <div className="tool-search-wrap" ref={ref}>
      <div className="dim-tool-list">
        {selectedIds.map(id=>{
          const t=toolLibrary[id];if(!t)return null;
          return <span className="dim-tool-tag" key={id}><TypeBadge type={t.type} small/>{t.name}<button className="rm" onClick={()=>onRemove(id)}>×</button></span>;
        })}
      </div>
      <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(o=>!o)}>+ Add Tool</button>
      {open&&(
        <div className="tool-popover">
          <input className="search-inp" style={{marginBottom:".45rem"}} placeholder="Search name or IT #…"
            value={search} onChange={e=>setSearch(e.target.value)} autoFocus />
          <div className="tool-pop-filters">
            {["All",...TOOL_TYPES].map(t=>(
              <button key={t} className={`tpf-btn${tf===t?" on":""}`} onClick={()=>setTf(t)}>{t}</button>
            ))}
          </div>
          <div className="tool-pop-list">
            {filtered.length===0&&<div style={{fontSize:".75rem",color:"var(--muted)",padding:".5rem"}}>No tools match.</div>}
            {filtered.map(t=>{
              const added=selectedIds.includes(t.id);
              return (
                <div key={t.id} className={`tool-pop-item${added?" added":""}`} onClick={()=>{if(!added)onAdd(t.id);}}>
                  <div><div className="tpi-name">{t.name}</div><div className="tpi-it">{t.itNum}{t.size?` · ${t.size}`:""}</div></div>
                  <div style={{display:"flex",alignItems:"center",gap:".4rem"}}>
                    <TypeBadge type={t.type} small/>
                    {added&&<span style={{color:"var(--ok)",fontSize:".7rem"}}>✔</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MissingPieceModal({ pieces, missingPieces, onSave, onCancel }) {
  const [local,setLocal]=useState(()=>{
    const m={};pieces.forEach(p=>{m[p]=missingPieces[p]||{reason:"",ncNum:"",details:""};});return m;
  });
  const valid=pieces.every(p=>local[p]?.reason&&!(local[p]?.reason==="Scrapped"&&!local[p]?.ncNum));
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <div className="modal-title" style={{marginBottom:0}}>Missing Piece Justification</div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>← Back</button>
        </div>
        <p className="text-muted" style={{marginBottom:"1rem",lineHeight:1.5}}>Pieces {pieces.join(", ")} have incomplete data. Provide a reason for each.</p>
        {pieces.map(p=>(
          <div key={p} style={{marginBottom:"1rem",padding:".75rem",background:"var(--panel)",borderRadius:"3px",border:"1px solid var(--border2)"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:".8rem",color:"var(--accent2)",marginBottom:".5rem"}}>Piece {p}</div>
            <div className="row2" style={{gap:".6rem"}}>
              <div className="field"><label>Reason</label>
                <select value={local[p]?.reason||""} onChange={e=>setLocal(v=>({...v,[p]:{...v[p],reason:e.target.value}}))}>
                  <option value="">— Select —</option>
                  {MISSING_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select></div>
              <div className="field"><label>NC # {local[p]?.reason==="Scrapped"?"(Required)":"(Opt.)"}</label>
                <input value={local[p]?.ncNum||""} placeholder="NC-2026-041" style={{fontFamily:"var(--mono)"}}
                  onChange={e=>setLocal(v=>({...v,[p]:{...v[p],ncNum:e.target.value}}))} /></div>
            </div>
            {local[p]?.reason==="Other"&&(
              <div className="field" style={{marginTop:".5rem"}}><label>Details</label>
                <input value={local[p]?.details||""} placeholder="Describe reason…" onChange={e=>setLocal(v=>({...v,[p]:{...v[p],details:e.target.value}}))} /></div>
            )}
            {local[p]?.reason==="Scrapped"&&!local[p]?.ncNum&&<p className="err-text">NC # required for scrapped pieces</p>}
          </div>
        ))}
        <div className="gap1 mt2">
          <button className="btn btn-partial" disabled={!valid} onClick={()=>onSave(local)}>Confirm &amp; Partial Submit</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function OperatorView({ parts, jobs, toolLibrary, onSubmit, onDraft, currentUserId, currentRole, onLockJob, onUnlockJob, onRefreshData, dataStatus, usersById }) {
  const [step,setStep]=useState("lookup");
  const [jobInput,setJobInput]=useState("");
  const [currentJob,setCurrentJob]=useState(null);
  const [values,setValues]=useState({});
  const [toolSel,setToolSel]=useState({});
  const [unlocked,setUnlocked]=useState({});
  const [missing,setMissing]=useState({});
  const [comment,setComment]=useState("");
  const [showModal,setShowModal]=useState(false);
  const [colWidths,setColWidths]=useState({});
  const [jobErr,setJobErr]=useState("");
  const [submitErr,setSubmitErr]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [issueCategory,setIssueCategory]=useState("app_functionality_issue");
  const [issueDetails,setIssueDetails]=useState("");
  const [issueErr,setIssueErr]=useState("");
  const [issueOk,setIssueOk]=useState("");
  const [reportingIssue,setReportingIssue]=useState(false);
  const [importCsv,setImportCsv]=useState("");
  const [importingCsv,setImportingCsv]=useState(false);
  const [importErr,setImportErr]=useState("");
  const [lastSubmitSource,setLastSubmitSource]=useState("manual");
  const importFileRef=useRef(null);
  const idleRef=useRef(null);
  const currentUserName = usersById?.[String(currentUserId)] || "";

  const part=currentJob?parts[currentJob.partNumber]:null;
  const opData=part?part.operations[currentJob.operation]:null;
  const dims=opData?.dimensions??[];

  function getColWidth(dimId){ return colWidths[dimId]||160; }
  function startResize(e,dimId){
    e.preventDefault();
    const startX=e.clientX;
    const startW=getColWidth(dimId);
    function onMove(ev){ setColWidths(p=>({...p,[dimId]:Math.max(110,startW+ev.clientX-startX)})); }
    function onUp(){ document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp); }
    document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
  }
  function maybeStartResize(e){
    if(e.button!==0) return;
    const cell=e.target?.closest?.("td[data-dim-id]");
    if(!cell) return;
    const rect=cell.getBoundingClientRect();
    const nearRightEdge=(rect.right - e.clientX) <= 12;
    if(!nearRightEdge) return;
    const dimId=cell.getAttribute("data-dim-id");
    if(!dimId) return;
    startResize(e, dimId);
  }
  function preventNegative(e){
    if(e.key==="-"||e.key==="e"||e.key==="E") e.preventDefault();
  }
  function handleValueKeyDown(e, key){
    if(e.key==="Escape"){
      e.preventDefault();
      setValues(p=>({...p,[key]:""}));
    }
  }
  function splitRange(val){ return splitRangeValue(val); }
  function setRangeValue(key, which, nextVal){
    const [minVal,maxVal]=splitRange(values[key]);
    const nextMin = which==="min"?nextVal:minVal;
    const nextMax = which==="max"?nextVal:maxVal;
    const next = (nextMin||nextMax)?`${nextMin}|${nextMax}`:"";
    setValues(p=>({...p,[key]:next}));
  }
  function isValueComplete(dim, val){
    if(val===undefined||val==="") return false;
    const mode=(dim?.inputMode||"single");
    if(mode==="range"){
      const [minVal,maxVal]=splitRange(val);
      return minVal!=="" && maxVal!=="";
    }
    return true;
  }
  function togglePf(key, value){
    setValues(p=>({...p,[key]:p[key]===value?"":value}));
  }
  function normalizeToolRows(raw){
    const rows=Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const normalized=rows
      .map(r=>({
        toolName:r?.toolName||"",
        toolId:r?.toolId?String(r.toolId):"",
        itNum:r?.itNum?String(r.itNum).toUpperCase():""
      }))
      .filter(r=>r.toolName||r.toolId||r.itNum);
    return normalized.length ? normalized : [{ toolName:"", toolId:"", itNum:"" }];
  }
  function getToolRows(dimId){
    return normalizeToolRows(toolSel?.[dimId]);
  }
  function setToolRows(dimId, updater){
    setToolSel(prev=>{
      const current=normalizeToolRows(prev?.[dimId]);
      const nextRows=normalizeToolRows(typeof updater==="function" ? updater(current) : updater);
      return { ...prev, [dimId]: nextRows };
    });
  }
  function getActiveToolRows(dimId){
    return normalizeToolRows(toolSel?.[dimId]).filter(r=>r.toolName||r.toolId||r.itNum);
  }

  const allPieces=dims.length>0
    ?[...new Set(dims.flatMap(d=>getSamplePieces(d.sampling,currentJob.qty,d.samplingInterval)))].sort((a,b)=>a-b):[];

  function isGaugeMode(dimId){
    const rows=getActiveToolRows(dimId);
    return rows.some(row=>row.toolId && toolLibrary[row.toolId]?.type==="Go/No-Go");
  }
  function cellRequired(dimId,pNum){
    const sourceDim=dims.find(d=>d.id===dimId);
    const inPlan=getSamplePieces(sourceDim?.sampling,currentJob.qty,sourceDim?.samplingInterval).includes(pNum);
    if(inPlan)return true;
    const key=`${dimId}_${pNum}`;
    return !!(unlocked[key]&&(values[key]||"")!=="");
  }

  const hasStarted=Object.values(values).some(v=>v!==undefined&&v!=="");
  const incompletePieces=dims.length>0?allPieces.filter(pNum=>{
    if(missing[pNum])return false;
    return dims.some(dim=>cellRequired(dim.id,pNum)&&!isValueComplete(dim,values[`${dim.id}_${pNum}`]));
  }):[];
  const ootList=dims.flatMap(dim=>{
    if(isGaugeMode(dim.id))return [];
    return getSamplePieces(dim.sampling,currentJob.qty,dim.samplingInterval)
      .filter(p=>!missing[p]&&isOOT(values[`${dim.id}_${p}`],dim.tolPlus,dim.tolMinus,dim.nominal)===true)
      .map(p=>({dim,piece:p}));
  });
  const hasOOT=ootList.length>0;
  const toolRequiredDims=dims.filter(d=>{
    return Object.keys(values).some(k=>k.startsWith(`${d.id}_`)&&(values[k]!==""&&values[k]!==undefined));
  });
  const toolsReady=toolRequiredDims.every(d=>{
    const rows=getActiveToolRows(d.id);
    if(rows.length===0) return false;
    return rows.every(r=>r.toolId&&r.itNum);
  });
  const canFull=toolsReady&&incompletePieces.length===0&&!(hasOOT&&!comment.trim());
  const canPartial=toolsReady&&incompletePieces.length>0;

  async function loadJob(key){
    const job=jobs[key?.trim().toUpperCase()];
    if(!job||(job.status!=="open"&&job.status!=="draft"))return;
    setJobErr("");
    if(job.lockOwnerUserId && String(job.lockOwnerUserId)!==String(currentUserId||"")){
      const lockName=usersById?.[String(job.lockOwnerUserId)]||`User #${job.lockOwnerUserId}`;
      setJobErr(`Job is locked by ${lockName}.`);
      return;
    }
    if(onLockJob){
      try{
        await onLockJob(job.jobNumber);
      }catch(err){
        setJobErr(err?.message||"Unable to lock job. Try another.");
        return;
      }
    }
    const dd=job.status==="draft"&&job.draftData;
    const ts={};
    parts[job.partNumber]?.operations[job.operation]?.dimensions.forEach(d=>{
      const saved=dd?.toolSel?.[d.id];
      if(Array.isArray(saved)){
        ts[d.id]=normalizeToolRows(saved.map(row=>{
          const t=row?.toolId?toolLibrary[row.toolId]:null;
          return {
            toolName:row?.toolName||t?.name||"",
            toolId:row?.toolId||"",
            itNum:row?.itNum||t?.itNum||""
          };
        }));
      }else if(saved){
        const t=saved.toolId?toolLibrary[saved.toolId]:null;
        ts[d.id]=normalizeToolRows([{
          toolName:saved.toolName||t?.name||"",
          toolId:saved.toolId||"",
          itNum:saved.itNum||t?.itNum||""
        }]);
      }else{
        ts[d.id]=[{ toolName:"", toolId:"", itNum:"" }];
      }
    });
    setCurrentJob(job);setValues(dd?.values||{});setToolSel(ts);
    setUnlocked(dd?.unlocked||{});setMissing(dd?.missing||{});setComment(dd?.comment||"");
    setImportCsv("");
    setImportErr("");
    setLastSubmitSource("manual");
    setStep("entry");
  }
  function buildRecord(status,rm){
    return {id:"r"+Date.now(),jobNumber:currentJob.jobNumber,partNumber:currentJob.partNumber,
      operation:currentJob.operation,lot:currentJob.lot,qty:currentJob.qty,
      timestamp:nowStr(),operator:(currentUserName||"").trim(),operatorUserId:currentUserId||null,values,tools:toolSel,unlocked,
      missingPieces:rm||missing,oot:hasOOT,status,comment};
  }
  async function handleFull(){
    if(hasOOT && !window.confirm("Out-of-tolerance values detected. Submit anyway?")) return;
    setSubmitting(true);setSubmitErr("");
    try{
      await onSubmit(buildRecord("complete"),currentJob.jobNumber);
      setLastSubmitSource("manual");
      setStep("success");
    }catch(err){
      setSubmitErr(err?.message||"Submit failed.");
    }finally{
      setSubmitting(false);
    }
  }
  async function handleMissingSave(r){
    setMissing(r);setShowModal(false);
    setSubmitting(true);setSubmitErr("");
    try{
      await onSubmit(buildRecord("incomplete",r),currentJob.jobNumber);
      setLastSubmitSource("manual");
      setStep("success");
    }catch(err){
      setSubmitErr(err?.message||"Submit failed.");
    }finally{
      setSubmitting(false);
    }
  }
  function handleDraft(){onDraft({jobNumber:currentJob.jobNumber,draftData:{values,toolSel,unlocked,missing,comment}});setStep("saved");}
  function triggerImportUpload(){
    if(importFileRef.current) importFileRef.current.click();
  }
  function handleImportUpload(e){
    const file=e.target.files?.[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>setImportCsv(String(reader.result||""));
    reader.readAsText(file);
    e.target.value="";
  }
  async function handleCsvMeasurementImport(){
    if(!currentJob?.jobNumber) return;
    if(!importCsv.trim()){
      setImportErr("Paste or upload CSV content first.");
      return;
    }
    if(!currentUserId){
      setImportErr("Select a current user before importing.");
      return;
    }
    setImportErr("");
    setImportingCsv(true);
    try{
      await api.imports.jobMeasurementsCsv(currentJob.jobNumber, {
        csvText: importCsv,
        operatorUserId: Number(currentUserId),
        operationId: currentJob.operationId,
        partId: currentJob.partNumber
      }, currentRole || "Operator");
      if(onRefreshData) await onRefreshData();
      setLastSubmitSource("csv");
      setStep("success");
    }catch(err){
      setImportErr(err?.message || "Measurement CSV import failed.");
    }finally{
      setImportingCsv(false);
    }
  }
  async function handleIssueSubmit(){
    if(dataStatus!=="live"){
      setIssueErr("Issue reporting requires live data mode.");
      setIssueOk("");
      return;
    }
    if(!currentUserId){
      setIssueErr("Select a current user before submitting an issue.");
      setIssueOk("");
      return;
    }
    if(!issueDetails.trim()){
      setIssueErr("Issue details are required.");
      setIssueOk("");
      return;
    }
    setReportingIssue(true);
    setIssueErr("");
    setIssueOk("");
    try{
      await api.issues.create({
        category: issueCategory,
        details: issueDetails.trim(),
        userId: Number(currentUserId),
        partId: currentJob?.partNumber || null,
        operationId: currentJob?.operationId || null,
        jobId: currentJob?.jobNumber || null
      }, currentRole || "Operator");
      setIssueDetails("");
      setIssueOk("Issue reported successfully.");
    }catch(err){
      setIssueErr(err?.message || "Unable to submit issue report.");
    }finally{
      setReportingIssue(false);
    }
  }
  function releaseLock(){
    if(onUnlockJob&&currentJob?.jobNumber){
      onUnlockJob(currentJob.jobNumber).catch(()=>{});
    }
  }
  function reset(){
    releaseLock();
    setStep("lookup");setJobInput("");setCurrentJob(null);setValues({});setToolSel({});setUnlocked({});setMissing({});setComment("");
  }

  useEffect(()=>{
    if(step!=="entry") return;
    if(idleRef.current) clearTimeout(idleRef.current);
    idleRef.current=setTimeout(()=>{
      if(!currentJob) return;
      if(hasStarted){
        onDraft({jobNumber:currentJob.jobNumber,draftData:{values,toolSel,unlocked,missing,comment}});
        setStep("saved");
      }else{
        setStep("lookup");
      }
      releaseLock();
    }, 20*60*1000);
    return ()=>{ if(idleRef.current) clearTimeout(idleRef.current); };
  },[step,values,toolSel,missing,comment,hasStarted,currentJob]);

  const openJobs=Object.values(jobs).filter(j=>j.status==="open"||j.status==="draft");
  if(step==="lookup") return (
    <div>
      <div className="card">
        <div className="card-head"><div className="card-title">Job Entry</div></div>
        <div className="card-body">
          <div className="row2">
            <div className="field" style={{gridColumn:"span 2"}}>
              <label>Job Number</label>
              <AutocompleteInput value={jobInput} onChange={setJobInput}
                options={openJobs.map(j=>({value:j.jobNumber,job:j}))}
                filterFn={(o,inp)=>o.value.toLowerCase().includes(inp.toLowerCase())}
                placeholder="e.g. J-10042" style={{fontFamily:"var(--mono)",fontSize:"1.05rem"}}
                renderOption={o=>(
                  <div>
                    <span style={{fontFamily:"var(--mono)",color:"var(--accent2)"}}>{o.value}</span>
                    {o.job.status==="draft"&&<span className="badge badge-draft" style={{marginLeft:".5rem",fontSize:".6rem"}}>Draft</span>}
                    <div className="ac-sub">Part {o.job.partNumber} · Op {o.job.operation} · {o.job.lot} · Qty {o.job.qty}</div>
                  </div>
                )} />
              {jobInput&&!jobs[jobInput.toUpperCase()]&&<p className="text-muted mt1" style={{fontSize:".75rem"}}>Job not found.</p>}
              {jobInput&&jobs[jobInput.toUpperCase()]?.status==="closed"&&<p className="mt1 text-warn" style={{fontSize:".75rem"}}>Job is closed.</p>}
              {(jobs[jobInput.toUpperCase()]?.status==="open"||jobs[jobInput.toUpperCase()]?.status==="draft")&&jobInput&&<p className="mt1 text-ok" style={{fontSize:".75rem"}}>Job found.</p>}
            </div>
          </div>
          <div className="text-muted" style={{fontSize:".75rem",marginTop:".65rem"}}>
            Current User: <span style={{color:"var(--text)",fontWeight:600}}>{currentUserName || "— Select user above —"}</span>
          </div>
          {jobErr&&<p className="err-text mt1">{jobErr}</p>}
          <div className="mt2">
            <button className="btn btn-primary"
              disabled={!currentUserId||!jobs[jobInput.toUpperCase()]||(jobs[jobInput.toUpperCase()]?.status!=="open"&&jobs[jobInput.toUpperCase()]?.status!=="draft")}
              onClick={()=>{
                if(!currentUserId){ setJobErr("Select a current user before loading a job."); return; }
                loadJob(jobInput);
              }}>Load Job →</button>
          </div>
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head"><div className="card-title">Available Jobs</div><div className="text-muted" style={{fontSize:".7rem"}}>Click to select</div></div>
        <table className="data-table">
          <thead><tr><th>Job #</th><th>Part</th><th>Operation</th><th>Lot</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>
            {openJobs.length===0&&<tr><td colSpan={6}><div className="empty-state">No open jobs.</div></td></tr>}
            {openJobs.map(j=>(
              <tr key={j.jobNumber} className="tr-click" onClick={()=>setJobInput(j.jobNumber)}>
                <td className="mono accent-text">{j.jobNumber}</td>
                <td className="mono">{j.partNumber}</td>
                <td>Op {j.operation} — {parts[j.partNumber]?.operations[j.operation]?.label}</td>
                <td>{j.lot}</td><td className="mono">{j.qty}</td>
                <td>
                  {j.status==="draft"?<span className="badge badge-draft">Draft</span>:<span className="badge badge-open">Open</span>}
                  {j.lockOwnerUserId&&String(j.lockOwnerUserId)!==String(currentUserId||"")&&(
                    <div className="text-muted" style={{fontSize:".7rem"}}>Locked by {usersById?.[String(j.lockOwnerUserId)]||`User #${j.lockOwnerUserId}`}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if(step==="entry") return (
    <div>
      <input ref={importFileRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={handleImportUpload}/>
      {showModal&&<MissingPieceModal pieces={incompletePieces} missingPieces={missing} onSave={handleMissingSave} onCancel={()=>setShowModal(false)}/>}
      <div className="job-strip">
        <div className="strip-field"><div className="strip-label">Job #</div><div className="strip-val">{currentJob.jobNumber}</div></div>
        <div className="strip-field"><div className="strip-label">Part</div><div className="strip-val">{currentJob.partNumber} <span style={{fontFamily:"var(--sans)",fontSize:".78rem",color:"var(--muted)"}}>{part?.description}</span></div></div>
        <div className="strip-field"><div className="strip-label">Operation</div><div className="strip-val">Op {currentJob.operation} — <span style={{fontFamily:"var(--sans)",fontSize:".82rem",color:"var(--text)"}}>{opData?.label}</span></div></div>
        <div className="strip-field"><div className="strip-label">Lot</div><div className="strip-val">{currentJob.lot}</div></div>
        <div className="strip-field"><div className="strip-label">Qty</div><div className="strip-val">{currentJob.qty} pcs</div></div>
        <div className="strip-field"><div className="strip-label">Operator</div><div className="strip-val" style={{fontFamily:"var(--sans)",fontSize:".85rem",color:"var(--text)"}}>{currentUserName || "—"}</div></div>
        <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={reset}>← Back</button>
      </div>

      <div className="card" style={{padding:0}}>
        <div className="card-head">
          <div className="card-title">Measurement Entry</div>
          <div className="text-muted ux-hint">+ unlocks N/A cells · × re-locks empty cells · Esc clears a value · auto-save after 20 min idle · drag near any column edge to resize</div>
        </div>
        <div className="meas-scroll">
          <table className="meas-table" onMouseDown={maybeStartResize} style={{width: 118 + dims.reduce((s,d)=>s+getColWidth(d.id),0)}}>
            <colgroup>
              <col style={{width:"118px"}}/>
              {dims.map(d=><col key={d.id} style={{width:getColWidth(d.id)+"px"}}/>)}
            </colgroup>
            <tbody>
              <tr className="hrow">
                <td className="rl">Dimension</td>
                {dims.map(d=>(
                  <td key={d.id} data-dim-id={d.id} className="dc" style={{padding:0,verticalAlign:"top",position:"relative"}}>
                    <div className="dim-hdr"><div className="dim-hdr-name">{d.name}</div><div className="dim-hdr-spec">{fmtSpec(d)}</div></div>
                    <div className="col-resize" onMouseDown={e=>startResize(e,d.id)}/>
                  </td>
                ))}
              </tr>
              <tr className="hrow">
                <td className="rl">Tools / IT #</td>
                {dims.map(d=>{
                  const allowedTools=d.tools.map(tid=>toolLibrary[tid]).filter(isToolSelectable);
                  const toolNames=[...new Set(allowedTools.map(t=>t.name))];
                  const rows=getToolRows(d.id);
                  return (
                    <td key={d.id} data-dim-id={d.id} className="dc hdr-cell" style={{verticalAlign:"top"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:".35rem"}}>
                        {rows.map((row,rowIdx)=>{
                          const selectedName=row.toolName||"";
                          const itOptions=selectedName?allowedTools.filter(t=>t.name===selectedName):allowedTools;
                          const itListId=`itlist_${d.id}_${rowIdx}`;
                          const currentIt=(row.itNum||"").toUpperCase();
                          const match=allowedTools.find(t=>String(t.itNum).toUpperCase()===currentIt);
                          const invalid=currentIt && !match;
                          return (
                            <div key={`${d.id}_${rowIdx}`} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:".3rem",alignItems:"start"}}>
                              <select className="hdr-inp" value={selectedName}
                                onChange={e=>{
                                  const name=e.target.value;
                                  setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolName:name,toolId:"",itNum:""}:r));
                                }}>
                                <option value="">— Select Tool —</option>
                                {toolNames.map(name=><option key={name} value={name}>{name}</option>)}
                              </select>
                              <div>
                                <input className="hdr-inp mf" list={itListId} value={currentIt}
                                  placeholder={selectedName ? "Type or select IT #" : "Type IT #"}
                                  onChange={e=>{
                                    const v=e.target.value.toUpperCase();
                                    const t=allowedTools.find(x=>String(x.itNum).toUpperCase()===v);
                                    setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolName:t?.name||r.toolName||"",toolId:t?.id||"",itNum:v}:r));
                                  }}
                                  onBlur={()=>{
                                    if(!currentIt){
                                      setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolId:"",itNum:""}:r));
                                      return;
                                    }
                                    if(match){
                                      setToolRows(d.id, prev=>prev.map((r,i)=>i===rowIdx?{...r,toolName:match.name,toolId:match.id,itNum:match.itNum}:r));
                                    }
                                  }}
                                />
                                <datalist id={itListId}>
                                  {itOptions.map(t=><option key={t.id} value={t.itNum}>{t.itNum}</option>)}
                                </datalist>
                                {invalid && <div className="text-warn" style={{fontSize:".65rem",marginTop:".2rem"}}>IT # not found for selected tool</div>}
                              </div>
                              <button className="btn btn-ghost btn-xs" type="button"
                                onClick={()=>setToolRows(d.id, prev=>[...prev,{toolName:"",toolId:"",itNum:""}])}>+</button>
                              <button className="btn btn-danger btn-xs" type="button" disabled={rows.length===1}
                                onClick={()=>setToolRows(d.id, prev=>{
                                  const next=prev.filter((_,i)=>i!==rowIdx);
                                  return next.length?next:[{toolName:"",toolId:"",itNum:""}];
                                })}>−</button>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr className="hrow">
                <td className="rl">Sampling</td>
                {dims.map(d=>(
                  <td key={d.id} data-dim-id={d.id} className="dc tag-cell">
                    <span className="sample-tag">{samplingLabel(d.sampling,d.samplingInterval)}</span>
                    {isGaugeMode(d.id)&&<span className="gauge-tag">Go/No-Go</span>}
                    {(d.inputMode||"single")==="range" && !isGaugeMode(d.id) && <span className="range-tag">Range</span>}
                  </td>
                ))}
              </tr>
              <tr className="div-row">
                <td style={{padding:0,height:"2px",borderBottom:"2px solid var(--accent)"}}/>
                {dims.map(d=><td key={d.id} data-dim-id={d.id} style={{padding:0,height:"2px",borderBottom:"2px solid var(--accent)"}}/>)}
              </tr>
              {allPieces.map(pNum=>{
                const isMissing=!!missing[pNum];
                return (
                  <tr className={`pr${isMissing?" mr":""}`} key={pNum}>
                    <td className="rl" style={{verticalAlign:"top",paddingTop:".45rem"}}>
                      Pc {pNum}
                      {isMissing&&<div className="mp-tag">{missing[pNum].reason}{missing[pNum].ncNum&&` · ${missing[pNum].ncNum}`}</div>}
                    </td>
                    {dims.map(dim=>{
                      const key=`${dim.id}_${pNum}`;
                      const inPlan=getSamplePieces(dim.sampling,currentJob.qty,dim.samplingInterval).includes(pNum);
                      const isUnlocked=!!unlocked[key];
                      const hasVal=isValueComplete(dim,values[key]);
                      const gaugeMode=isGaugeMode(dim.id);
                      const rangeMode=(dim.inputMode||"single")==="range" && !gaugeMode;
                      if(isMissing){
                        return <td key={dim.id} data-dim-id={dim.id} style={{textAlign:"center",color:"var(--border2)",fontFamily:"var(--mono)",fontSize:".78rem",padding:".26rem .4rem",verticalAlign:"middle"}}>—</td>;
                      }
                      if(!inPlan&&!isUnlocked){
                        return <td key={dim.id} data-dim-id={dim.id} style={{padding:".26rem .4rem",verticalAlign:"middle"}}><button className="na-btn" onClick={()=>setUnlocked(p=>({...p,[key]:true}))}>+</button></td>;
                      }
                      if(isUnlocked&&!hasVal&&!inPlan){
                        return (
                          <td key={dim.id} data-dim-id={dim.id} style={{padding:".26rem .4rem",verticalAlign:"middle"}}>
                            <div className="ue-wrap">
                              {gaugeMode?(
                                <div className="pf-wrap" style={{flex:1}}>
                                  <button className={`pf-btn${values[key]==="PASS"?" pass-on":""}`} onClick={()=>togglePf(key,"PASS")}>P</button>
                                  <button className={`pf-btn${values[key]==="FAIL"?" fail-on":""}`} onClick={()=>togglePf(key,"FAIL")}>F</button>
                                </div>
                              ):(
                                rangeMode?(
                                  <div style={{display:"flex",gap:".35rem",flex:1}}>
                                    <input className="vi ux" type="number" min="0" step="0.0001" placeholder="Min" value={splitRange(values[key])[0]}
                                      onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);}}
                                      onChange={e=>setRangeValue(key,"min",e.target.value)} style={{flex:1}}/>
                                    <input className="vi ux" type="number" min="0" step="0.0001" placeholder="Max" value={splitRange(values[key])[1]}
                                      onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);}}
                                      onChange={e=>setRangeValue(key,"max",e.target.value)} style={{flex:1}}/>
                                  </div>
                                ):(
                                  <input className="vi ux" type="number" min="0" step="0.0001" placeholder="0.0000" value={values[key]||""}
                                    onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);}}
                                    onChange={e=>setValues(p=>({...p,[key]:e.target.value}))} style={{flex:1}}/>
                                )
                              )}
                              <button className="relock-btn" onClick={()=>setUnlocked(p=>{const n={...p};delete n[key];return n;})}>×</button>
                            </div>
                          </td>
                        );
                      }
                      if(gaugeMode){
                        const v=values[key];
                        return (
                          <td key={dim.id} data-dim-id={dim.id} style={{padding:".26rem .4rem",verticalAlign:"middle"}}>
                            <div className="pf-wrap">
                              <button className={`pf-btn${v==="PASS"?" pass-on":""}`} onClick={()=>togglePf(key,"PASS")}>Pass</button>
                              <button className={`pf-btn${v==="FAIL"?" fail-on":""}`} onClick={()=>togglePf(key,"FAIL")}>Fail</button>
                            </div>
                          </td>
                        );
                      }
                      const v=values[key]??"";
                      const st=isOOT(v,dim.tolPlus,dim.tolMinus,dim.nominal);
                      const cls=v===""?"":st===false?"ok":"oot";
                      return (
                        <td key={dim.id} data-dim-id={dim.id} style={{padding:".26rem .4rem",verticalAlign:"middle"}}>
                          {rangeMode?(
                            <div style={{display:"flex",gap:".35rem"}}>
                              <input className={`vi ${cls}${isUnlocked?" ux":""}`} type="number" min="0" step="0.0001"
                                value={splitRange(v)[0]} placeholder="Min" onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);}} onChange={e=>setRangeValue(key,"min",e.target.value)} style={{flex:1}}/>
                              <input className={`vi ${cls}${isUnlocked?" ux":""}`} type="number" min="0" step="0.0001"
                                value={splitRange(v)[1]} placeholder="Max" onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);}} onChange={e=>setRangeValue(key,"max",e.target.value)} style={{flex:1}}/>
                            </div>
                          ):(
                            <input className={`vi ${cls}${isUnlocked?" ux":""}`} type="number" min="0" step="0.0001"
                              value={v} placeholder="0.0000" onKeyDown={e=>{preventNegative(e);handleValueKeyDown(e,key);}} onChange={e=>setValues(p=>({...p,[key]:e.target.value}))}/>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {hasOOT&&(
        <div className="oot-banner">
          <div className="oot-icon">▲</div>
          <div>
            <div className="oot-title">Out-of-Tolerance Detected</div>
            <div className="oot-body">{ootList.map((o,i)=><span key={i}>{o.dim.name} — Pc {o.piece}{i<ootList.length-1?",  ":""}</span>)}<br/>Comment required before submitting.</div>
          </div>
        </div>
      )}
      {hasStarted&&incompletePieces.length>0&&(
        <div className="inc-banner">
          <div className="inc-title">Incomplete Data — {incompletePieces.length} piece{incompletePieces.length!==1?"s":""} missing values</div>
          <p style={{fontSize:".78rem",color:"#a08040",lineHeight:1.5,marginBottom:".55rem"}}>Pieces {incompletePieces.join(", ")} have unfilled measurements. Save draft to return later, or Partial Submit to log reasons and close for supervisor review.</p>
          <div className="gap1">{incompletePieces.map(p=><span key={p} className="badge badge-incomplete">Pc {p}</span>)}</div>
        </div>
      )}
      <div className="card">
        <div className="card-head"><div className="card-title">Operation CSV Import</div></div>
        <div className="card-body">
          <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Upload a single operation measurement CSV for this loaded job. This is operator-facing ingest for data from CMM/other local systems.</p>
          <textarea value={importCsv} onChange={e=>setImportCsv(e.target.value)} rows={5} placeholder="piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
          <div className="gap1 mt1">
            <button className="btn btn-ghost btn-sm" onClick={()=>setImportCsv("piece_number,dimension_name,value,is_oot,tool_it_nums,missing_reason,nc_num,details\n1,Bore Diameter,0.6250,false,IT-0031,,,")}>Load Sample</button>
            <button className="btn btn-ghost btn-sm" onClick={triggerImportUpload}>Upload CSV</button>
            <button className="btn btn-primary btn-sm" disabled={importingCsv} onClick={handleCsvMeasurementImport}>{importingCsv?"Importing…":"Import & Close Job"}</button>
          </div>
          {importErr&&<p className="err-text mt1">{importErr}</p>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">{hasOOT?"OOT Comment (Required)":"Comments"}</div></div>
        <div className="card-body">
          <textarea value={comment} onChange={e=>setComment(e.target.value)}
            placeholder={hasOOT?"Describe the out-of-tolerance condition and corrective action...":"Optional notes…"}/>
          <div className="mt2 gap1">
            <button className="btn btn-primary" disabled={!canFull||submitting} onClick={handleFull}>{submitting?"Submitting…":"Submit & Close Job"}</button>
            {canPartial&&<button className="btn btn-partial" disabled={submitting} onClick={()=>setShowModal(true)}>Partial Submit…</button>}
            <button className="btn btn-draft" disabled={submitting} onClick={handleDraft}>Save Draft</button>
            {!toolsReady&&<span className="text-muted">Tool &amp; IT # required for any measured dimension</span>}
            {toolsReady&&hasOOT&&!comment.trim()&&<span className="text-warn" style={{fontSize:".75rem"}}>Comment required for OOT</span>}
          </div>
          {submitErr&&<p className="err-text mt1">{submitErr}</p>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Report Issue</div></div>
        <div className="card-body">
          <div className="row2">
            <div className="field">
              <label>Category</label>
              <select value={issueCategory} onChange={e=>setIssueCategory(e.target.value)}>
                {ISSUE_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="field" style={{gridColumn:"span 2"}}>
              <label>Details</label>
              <textarea value={issueDetails} onChange={e=>setIssueDetails(e.target.value)} placeholder="Describe the issue, what you expected, and what happened." />
            </div>
          </div>
          <div className="gap1 mt1">
            <button className="btn btn-ghost" onClick={handleIssueSubmit} disabled={reportingIssue || !issueDetails.trim()}>
              {reportingIssue ? "Submitting…" : "Submit Issue"}
            </button>
            {issueOk && <span className="text-ok">{issueOk}</span>}
            {issueErr && <span className="text-warn">{issueErr}</span>}
          </div>
        </div>
      </div>
    </div>
  );

  if(step==="saved") return (
    <div className="draft-card">
      <div style={{fontSize:"2rem"}}>💾</div>
      <div className="draft-title">Draft Saved</div>
      <p className="text-muted">Job <strong style={{color:"var(--draft)"}}>{currentJob.jobNumber}</strong> saved. Resume anytime from the job list.</p>
      <div className="gap1 mt1"><button className="btn btn-ghost" onClick={reset}>Back to Job List</button></div>
    </div>
  );
  return (
    <div className="success-card">
      <div style={{fontSize:"2rem"}}>✔</div>
      <div className="success-title">{lastSubmitSource==="csv" ? "CSV Imported — Job Closed" : "Record Submitted — Job Closed"}</div>
      <p className="text-muted">Job <strong style={{color:"var(--accent2)"}}>{currentJob?.jobNumber}</strong> · {currentJob?.lot} · Op {currentJob?.operation}</p>
      {hasOOT&&<p className="text-warn" style={{fontSize:".8rem"}}>OOT recorded — notify supervisor.</p>}
      <div className="gap1 mt1"><button className="btn btn-ghost" onClick={reset}>Enter Another Job</button></div>
    </div>
  );
}

function AdminTools({ toolLibrary, toolLocations, onCreateTool, onUpdateTool, onCreateToolLocation, onUpdateToolLocation, onRemoveToolLocation }) {
  const empty={name:"",type:"Variable",itNum:"",size:"",calibrationDueDate:"",currentLocationId:"",homeLocationId:"",active:true,visible:true};
  const [form,setForm]=useState(empty);
  const [locationForm,setLocationForm]=useState({ name:"", locationType:"machine" });
  const [err,setErr]=useState("");
  const [apiErr,setApiErr]=useState("");
  const [locErr,setLocErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [savingId,setSavingId]=useState("");
  const [search,setSearch]=useState("");
  const [tf,setTf]=useState("All");

  async function handleAdd(){
    if(!form.name.trim()||!form.itNum.trim()){setErr("Name and IT # required.");return;}
    setErr("");setApiErr("");setSaving(true);
    try{
      await onCreateTool({
        name:form.name.trim(),
        type:form.type,
        itNum:form.itNum.trim().toUpperCase(),
        size:form.size.trim(),
        calibrationDueDate:form.calibrationDueDate || null,
        currentLocationId:form.currentLocationId ? Number(form.currentLocationId) : null,
        homeLocationId:form.homeLocationId ? Number(form.homeLocationId) : null,
        active:form.active!==false,
        visible:form.visible!==false
      });
      setForm(empty);
    }catch(e){
      setApiErr(e?.message||"Unable to add tool.");
    }finally{
      setSaving(false);
    }
  }
  async function handleToggle(id, patch){
    setApiErr("");
    setSavingId(String(id));
    try{
      await onUpdateTool(id, patch);
    }catch(e){
      if(e?.message==="tool_in_open_job"){
        setApiErr("Tool is referenced by an open or draft job. Close the job before deactivating.");
      }else{
        setApiErr(e?.message||"Unable to update tool.");
      }
    }finally{
      setSavingId("");
    }
  }
  async function handleAddLocation(){
    if(!locationForm.name.trim()){ setLocErr("Location name required."); return; }
    setLocErr("");
    try{
      await onCreateToolLocation({ name:locationForm.name.trim(), locationType:locationForm.locationType });
      setLocationForm({ name:"", locationType:"machine" });
    }catch(e){
      setLocErr(e?.message || "Unable to create location.");
    }
  }
  async function handleRemoveLocation(id){
    setLocErr("");
    try{
      await onRemoveToolLocation(id);
    }catch(e){
      if(e?.message==="location_in_use"){
        setLocErr("Location is in use by one or more tools.");
      }else{
        setLocErr(e?.message || "Unable to remove location.");
      }
    }
  }
  const filtered=Object.values(toolLibrary).filter(t=>{
    const hay=[t.name,t.itNum,t.size,t.currentLocationName,t.homeLocationName].filter(Boolean).join(" ").toLowerCase();
    const ms=!search||hay.includes(search.toLowerCase());
    return ms&&(tf==="All"||t.type===tf);
  });
  const locationTypes=["machine","user","job","vendor","out_for_calibration"];
  return (
    <div>
      <div className="card">
        <div className="card-head"><div className="card-title">Location Master Data</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Location Name</label><input value={locationForm.name} onChange={e=>setLocationForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Machine Cell C"/></div>
            <div className="field"><label>Location Type</label>
              <select value={locationForm.locationType} onChange={e=>setLocationForm(p=>({...p,locationType:e.target.value}))}>
                {locationTypes.map(type=><option key={type} value={type}>{type}</option>)}
              </select></div>
            <div className="field" style={{justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={handleAddLocation}>+ Add Location</button>
            </div>
          </div>
          {locErr&&<p className="err-text mt1">{locErr}</p>}
          <div className="mt1" style={{display:"grid",gap:".35rem"}}>
            {toolLocations.length===0 && <div className="text-muted">No locations configured.</div>}
            {toolLocations.map(loc=>(
              <div key={loc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:".75rem",padding:".3rem .45rem",border:"1px solid var(--border2)",borderRadius:"2px"}}>
                <div>
                  <span style={{fontWeight:600}}>{loc.name}</span>
                  <span className="text-muted" style={{marginLeft:".5rem",fontSize:".72rem"}}>{loc.locationType}</span>
                </div>
                <button className="btn btn-danger btn-sm" onClick={()=>handleRemoveLocation(loc.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Add New Tool</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Tool Name</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Outside Micrometer"/></div>
            <div className="field"><label>Tool Type</label>
              <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {TOOL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field"><label>IT # / Cal. Number</label>
              <input value={form.itNum} onChange={e=>setForm(p=>({...p,itNum:e.target.value.toUpperCase()}))} placeholder="IT-0099" style={{fontFamily:"var(--mono)"}}/></div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Size</label>
              <input value={form.size} onChange={e=>setForm(p=>({...p,size:e.target.value}))} placeholder='e.g. 0-6 in' style={{fontFamily:"var(--mono)"}}/></div>
            <div className="field"><label>Calibration Due Date</label>
              <input type="date" value={form.calibrationDueDate||""} onChange={e=>setForm(p=>({...p,calibrationDueDate:e.target.value}))}/></div>
            <div className="field"><label>Home Location</label>
              <select value={form.homeLocationId} onChange={e=>setForm(p=>({...p,homeLocationId:e.target.value}))}>
                <option value="">— None —</option>
                {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
              </select></div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Current Location</label>
              <select value={form.currentLocationId} onChange={e=>setForm(p=>({...p,currentLocationId:e.target.value}))}>
                <option value="">— None —</option>
                {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
              </select></div>
            <div className="field" style={{display:"flex",gap:"1.25rem",alignItems:"flex-end"}}>
              <label style={{display:"flex",alignItems:"center",gap:".5rem",fontSize:".85rem"}}>
                <input type="checkbox" checked={form.active!==false} onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/>
                Active
              </label>
              <label style={{display:"flex",alignItems:"center",gap:".5rem",fontSize:".85rem"}}>
                <input type="checkbox" checked={form.visible!==false} onChange={e=>setForm(p=>({...p,visible:e.target.checked}))}/>
                Selectable
              </label>
            </div>
          </div>
          <div className="mt1">
            <div className="text-muted" style={{fontSize:".7rem",marginBottom:".35rem"}}>Common tool templates</div>
            <div className="gap1" style={{flexWrap:"wrap"}}>
              {COMMON_TOOL_TEMPLATES.map(t=>(
                <button key={t.name} className="btn btn-ghost btn-xs" onClick={()=>setForm(p=>({...p,name:t.name,type:t.type}))}>{t.name}</button>
              ))}
            </div>
          </div>
          {err&&<p className="err-text mt1">{err}</p>}
          {apiErr&&<p className="err-text mt1">{apiErr}</p>}
          <div className="mt2"><button className="btn btn-primary" disabled={saving} onClick={handleAdd}>{saving?"Saving…":"+ Add Tool"}</button></div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Tool Library</div><div className="text-muted" style={{fontSize:".7rem"}}>{Object.keys(toolLibrary).length} tools</div></div>
        <div className="card-body" style={{paddingBottom:".5rem"}}>
          <div className="row2" style={{gap:".75rem",marginBottom:".75rem"}}>
            <input className="search-inp" placeholder="Search by name, IT #, or location…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <div style={{display:"flex",gap:".35rem",flexWrap:"wrap"}}>
              {["All",...TOOL_TYPES].map(t=><button key={t} className={`tpf-btn${tf===t?" on":""}`} onClick={()=>setTf(t)}>{t}</button>)}
            </div>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Tool Name</th><th>Type</th><th>IT #</th><th>Cal Due</th><th>Current Location</th><th>Home Location</th><th>Size</th><th style={{width:"110px"}}>Active</th><th style={{width:"120px"}}>Selectable</th></tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={9}><div className="empty-state">No tools match.</div></td></tr>}
            {filtered.map(t=>(
              <tr key={t.id}>
                <td style={{fontWeight:600}}>{t.name}</td>
                <td><TypeBadge type={t.type}/></td>
                <td className="mono">{t.itNum}</td>
                <td>
                  <input
                    type="date"
                    value={t.calibrationDueDate || ""}
                    disabled={savingId===String(t.id)}
                    onChange={e=>handleToggle(t.id, { calibrationDueDate: e.target.value || null })}
                  />
                </td>
                <td>
                  <select
                    value={t.currentLocationId ? String(t.currentLocationId) : ""}
                    disabled={savingId===String(t.id)}
                    onChange={e=>handleToggle(t.id, { currentLocationId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— None —</option>
                    {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
                  </select>
                </td>
                <td>
                  <select
                    value={t.homeLocationId ? String(t.homeLocationId) : ""}
                    disabled={savingId===String(t.id)}
                    onChange={e=>handleToggle(t.id, { homeLocationId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— None —</option>
                    {toolLocations.map(loc=><option key={loc.id} value={String(loc.id)}>{loc.name} ({loc.locationType})</option>)}
                  </select>
                </td>
                <td className="mono" style={{fontSize:".74rem",color:"var(--muted)"}}>{t.size||"—"}</td>
                <td>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".8rem"}}>
                    <input
                      type="checkbox"
                      checked={t.active!==false}
                      disabled={savingId===String(t.id)}
                      onChange={e=>{
                        const nextActive=e.target.checked;
                        const patch={ active: nextActive };
                        if(!nextActive && t.visible!==false) patch.visible=false;
                        handleToggle(t.id, patch);
                      }}
                    />
                    {t.active!==false?"Active":"Inactive"}
                  </label>
                </td>
                <td>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".8rem",opacity:t.active!==false?1:0.6}}>
                    <input
                      type="checkbox"
                      checked={t.visible!==false}
                      disabled={savingId===String(t.id)||t.active===false}
                      onChange={e=>handleToggle(t.id, { visible: e.target.checked })}
                    />
                    {t.visible!==false?"Selectable":"Hidden"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminUsers({ users, roleCaps, onCreateUser, onUpdateUser, onRemoveUser, onDirtyChange }) {
  const [form,setForm]=useState({name:"",role:"Operator",active:true});
  const [err,setErr]=useState("");
  const [apiErr,setApiErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [savingAll,setSavingAll]=useState(false);
  const [edits,setEdits]=useState({});
  async function handleAdd(){
    if(!form.name.trim()){setErr("Name required.");return;}
    setErr("");setApiErr("");setSaving(true);
    try{
      await onCreateUser({name:form.name.trim(),role:form.role,active:form.active});
      setForm({name:"",role:"Operator",active:true});
    }catch(e){
      setApiErr(e?.message||"Unable to add user.");
    }finally{
      setSaving(false);
    }
  }
  function editFor(u){ return edits[u.id] || { name:u.name, role:u.role, active:u.active!==false }; }
  function editForId(id){
    const u=users.find(x=>String(x.id)===String(id));
    if(u) return editFor(u);
    return edits[id] || { name:"", role:"Operator", active:true };
  }
  function updateEdit(id, patch){
    const next={...editForId(id),...patch};
    const u=users.find(x=>String(x.id)===String(id));
    if(u && next.name===u.name && next.role===u.role && (next.active!==false)===(u.active!==false)){
      setEdits(p=>{const n={...p};delete n[id];return n;});
      return;
    }
    setEdits(p=>({...p,[id]:next}));
  }
  async function handleSaveAll(){
    const ids=Object.keys(edits);
    if(ids.length===0) return;
    setApiErr("");setSavingAll(true);
    try{
      for(const id of ids){
        const v=editForId(id);
        await onUpdateUser(id, {name:v.name, role:v.role, active:v.active});
      }
      setEdits({});
    }catch(e){
      setApiErr(e?.message||"Unable to update users.");
    }finally{
      setSavingAll(false);
    }
  }
  function handleDiscardAll(){ setEdits({}); }
  async function handleRemove(id){
    setApiErr("");
    try{
      await onRemoveUser(id);
    }catch(e){
      setApiErr(e?.message||"Unable to remove user.");
    }
  }
  useEffect(()=>{
    if(onDirtyChange) onDirtyChange(Object.keys(edits).length>0);
  },[edits,onDirtyChange]);
  const orderedRoles=["Operator","Quality","Supervisor","Admin"];
  function roleSummary(role){
    const caps=(roleCaps?.[role]||[]).slice();
    if(!caps.length) return "No permissions assigned.";
    const labels=caps
      .map(cap=>CAPABILITY_DEFS.find(c=>c.key===cap)?.label || cap.replace(/_/g," "))
      .sort((a,b)=>a.localeCompare(b));
    const viewCount=caps.filter(c=>c.startsWith("view_")).length;
    const manageCount=caps.filter(c=>c.startsWith("manage_")).length;
    const highlights=[
      viewCount ? `${viewCount} view` : "",
      manageCount ? `${manageCount} manage` : "",
      caps.includes("submit_records") ? "submit records" : "",
      caps.includes("edit_records") ? "edit records" : ""
    ].filter(Boolean).join(" · ");
    return `${highlights ? `${highlights} | ` : ""}${labels.join(", ")}`;
  }
  return (
    <div>
      <div className="card">
        <div className="card-head" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem"}}>
          <div className="card-title">Add New User</div>
          <div className="gap1">
            <button className="btn btn-ghost btn-sm" disabled={savingAll||Object.keys(edits).length===0} onClick={handleDiscardAll}>Discard Changes</button>
            <button className="btn btn-primary btn-sm" disabled={savingAll||Object.keys(edits).length===0} onClick={handleSaveAll}>
              {savingAll?"Saving…":"Save All"}
            </button>
          </div>
        </div>
        <div className="card-body">
          {Object.keys(edits).length>0&&(
            <div className="banner warn" style={{marginBottom:".75rem"}}>
              You have unsaved changes. Save All or Discard Changes before leaving this page.
            </div>
          )}
          <div className="row3">
            <div className="field"><label>Name</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Alex Rivera"/></div>
            <div className="field"><label>Role</label>
              <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                <option>Operator</option><option>Quality</option><option>Supervisor</option><option>Admin</option>
              </select></div>
            <div className="field" style={{display:"flex",alignItems:"center",gap:".5rem"}}>
              <label style={{marginTop:"1.25rem"}}><input type="checkbox" checked={form.active} onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/> Active</label>
            </div>
          </div>
          {err&&<p className="err-text mt1">{err}</p>}
          {apiErr&&<p className="err-text mt1">{apiErr}</p>}
          <div className="mt2"><button className="btn btn-primary" disabled={saving} onClick={handleAdd}>{saving?"Saving…":"+ Add User"}</button></div>
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head"><div className="card-title">Users</div></div>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Role</th><th>Active</th><th style={{width:"60px"}}></th></tr></thead>
          <tbody>
            {users.length===0&&<tr><td colSpan={4}><div className="empty-state">No users found.</div></td></tr>}
            {users.map(u=>{
              const v=editFor(u);
              return (
                <tr key={u.id}>
                  <td><input value={v.name} onChange={e=>updateEdit(u.id,{name:e.target.value})} /></td>
                  <td>
                    <select value={v.role} onChange={e=>updateEdit(u.id,{role:e.target.value})}>
                      <option>Operator</option><option>Quality</option><option>Supervisor</option><option>Admin</option>
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={v.active} onChange={e=>updateEdit(u.id,{active:e.target.checked})}/>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={()=>handleRemove(u.id)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="card-body" style={{paddingTop:".75rem"}}>
          <div className="section-label" style={{marginBottom:".35rem"}}>Role Permissions (Live)</div>
          <div className="text-muted" style={{fontSize:".78rem",lineHeight:1.5}}>
            {orderedRoles.map(role=>(
              <div key={role}>
                <strong style={{color:"var(--text)"}}>{role}</strong>: {roleSummary(role)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminRoles({ roleCaps, onUpdateRoleCaps, onDirtyChange }) {
  const [role,setRole]=useState("Operator");
  const [local,setLocal]=useState(roleCaps?.[role]||[]);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");
  useEffect(()=>{ setLocal(roleCaps?.[role]||[]); },[role,roleCaps]);
  const baseCaps=roleCaps?.[role]||[];
  const dirty=JSON.stringify([...local].sort())!==JSON.stringify([...baseCaps].sort());
  useEffect(()=>{ if(onDirtyChange) onDirtyChange(dirty); },[dirty,onDirtyChange]);
  function toggleCap(cap){
    setLocal(prev=>prev.includes(cap)?prev.filter(c=>c!==cap):[...prev,cap]);
  }
  async function handleSave(){
    setErr("");setSaving(true);
    try{
      await onUpdateRoleCaps(role, local);
    }catch(e){
      setErr(e?.message||"Unable to update role.");
    }finally{
      setSaving(false);
    }
  }
  function handleDiscard(){ setLocal(baseCaps); }
  return (
    <div>
      <div className="card">
        <div className="card-head" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem"}}>
          <div className="card-title">Role Capabilities</div>
          <div className="gap1">
            <button className="btn btn-ghost btn-sm" disabled={!dirty||saving} onClick={handleDiscard}>Discard</button>
            <button className="btn btn-primary btn-sm" disabled={!dirty||saving} onClick={handleSave}>{saving?"Saving…":"Save Changes"}</button>
          </div>
        </div>
        <div className="card-body">
          <div className="row2" style={{marginBottom:".75rem"}}>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={e=>setRole(e.target.value)}>
                {Object.keys(roleCaps||DEFAULT_ROLE_CAPS).map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field" style={{alignItems:"flex-end"}}>
              {dirty && <div className="text-warn" style={{fontSize:".75rem"}}>Unsaved changes</div>}
            </div>
          </div>
          {err&&<p className="err-text mt1">{err}</p>}
          <table className="data-table">
            <thead><tr><th>Capability</th><th>Description</th><th style={{width:"80px"}}>Enabled</th></tr></thead>
            <tbody>
              {CAPABILITY_DEFS.map(c=>(
                <tr key={c.key}>
                  <td style={{fontWeight:600}}>{c.label}</td>
                  <td className="text-muted">{c.desc}</td>
                  <td>
                    <input type="checkbox" checked={local.includes(c.key)} onChange={()=>toggleCap(c.key)}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminJobs({ parts, jobs, usersById, onCreateJob, canManageJobs, onUnlockJob }) {
  function newBaseId(){
    return String(Math.floor(Date.now()/1000)%1000000).padStart(6,"0");
  }
  function parseFamilyJobNumber(jobNumber, opMatchers=[]){
    const s=String(jobNumber||"").trim().toUpperCase();
    const run=s.slice(-2);
    if(!/^\d{2}$/.test(run) || s.length <= 2) return null;
    const head=s.slice(0,-2);
    const sortedMatchers=[...(opMatchers||[])].sort((a,b)=>b.match.length-a.match.length);
    for(const matcher of sortedMatchers){
      if(!head.endsWith(matcher.match)) continue;
      const baseId=head.slice(0,-matcher.match.length);
      if(!baseId) continue;
      return {
        baseId,
        operationCode:matcher.normalized,
        runIndex:Number(run)
      };
    }
    const match3=head.match(/^(.+)(\d{3})$/);
    const match2=head.match(/^(.+)(\d{2})$/);
    let m=null;
    if(match3 && match3[2].startsWith("0")){
      m=match3;
    }else if(match2){
      m=match2;
    }else{
      m=match3;
    }
    if(!m) return null;
    const normalizedOp=normalizeOpNumber(m[2]);
    return {
      baseId:m[1],
      operationCode:normalizedOp || m[2],
      runIndex:Number(run)
    };
  }
  const empty={jobNumber:"",partNumber:"",partRevision:"",operation:"",lot:"",qty:""};
  const [form,setForm]=useState(empty);
  const [err,setErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [buildErr,setBuildErr]=useState("");
  const [building,setBuilding]=useState(false);
  const [builder,setBuilder]=useState({partNumber:"",partRevision:"",lot:"",qty:"",ops:{}});
  const [baseId,setBaseId]=useState(()=>newBaseId());
  const partOps=form.partNumber&&parts[form.partNumber]?Object.entries(parts[form.partNumber].operations):[];
  const builderOps=builder.partNumber&&parts[builder.partNumber]?Object.entries(parts[builder.partNumber].operations):[];
  const builderOpMatchers=builderOps.flatMap(([opKey])=>{
    const normalized=normalizeOpNumber(opKey) || String(opKey);
    const short=String(Number(normalized));
    if(short && short !== normalized){
      return [{ match: normalized, normalized }, { match: short, normalized }];
    }
    return [{ match: normalized, normalized }];
  });
  const existingLotJobs=builder.partNumber&&builder.partRevision&&builder.lot
    ?Object.values(jobs).filter(j=>j.partNumber===builder.partNumber&&j.partRevision===builder.partRevision&&String(j.lot).toLowerCase()===String(builder.lot).toLowerCase())
    :[];
  const existingLotOpMatchers=existingLotJobs.flatMap((j)=>{
    const normalized=normalizeOpNumber(j.operation) || normalizeOpNumber(j.operationId);
    if(!normalized) return [];
    const short=String(Number(normalized));
    if(short && short !== normalized){
      return [{ match: normalized, normalized }, { match: short, normalized }];
    }
    return [{ match: normalized, normalized }];
  });
  const familyOpMatchers=[...builderOpMatchers, ...existingLotOpMatchers].filter((m, idx, arr)=>{
    return arr.findIndex(x=>x.match===m.match && x.normalized===m.normalized)===idx;
  });
  const existingLotMeta=existingLotJobs
    .map(j=>parseFamilyJobNumber(j.jobNumber, familyOpMatchers))
    .filter(Boolean);
  const isDuplicateLot=existingLotJobs.length>0;
  const preferredBaseId=(()=>{
    if(existingLotMeta.length===0) return "";
    const byBase={};
    existingLotMeta.forEach(m=>{ byBase[m.baseId]=(byBase[m.baseId]||0)+1; });
    return Object.entries(byBase).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
  })();
  const nextFamilyRunIndex=existingLotMeta.length
    ?Math.max(...existingLotMeta.map(m=>Number(m.runIndex)||0))+1
    :1;
  const effectiveBaseId=(isDuplicateLot&&preferredBaseId)?preferredBaseId:baseId;
  useEffect(()=>{
    if(!builder.partNumber) return;
    const ops=Object.keys(parts[builder.partNumber]?.operations||{});
    const nextOps={};
    const defaultOn=builder.lot && !isDuplicateLot;
    ops.forEach(op=>{ nextOps[op]=defaultOn; });
    setBuilder(p=>({...p,ops:nextOps}));
  },[builder.partNumber,builder.partRevision,builder.lot,isDuplicateLot,parts]);
  useEffect(()=>{
    if(isDuplicateLot&&preferredBaseId&&baseId!==preferredBaseId){
      setBaseId(preferredBaseId);
    }
  },[isDuplicateLot,preferredBaseId,baseId]);
  async function handleAdd(){
    if(!form.jobNumber||!form.partNumber||!form.partRevision||!form.operation||!form.lot||!form.qty){setErr("All fields required.");return;}
    if(jobs[form.jobNumber.toUpperCase()]){setErr("Job number already exists.");return;}
    setErr("");setSaving(true);
    try{
      await onCreateJob({...form,jobNumber:form.jobNumber.toUpperCase(),qty:parseInt(form.qty),status:"open"});
      setForm(empty);
    }catch(e){
      setErr(e?.message||"Unable to create job.");
    }finally{
      setSaving(false);
    }
  }
  async function handleBuild(){
    if(!builder.partNumber||!builder.partRevision||!builder.lot||!builder.qty){setBuildErr("Part, revision, lot, and qty required.");return;}
    const opsSelected=Object.keys(builder.ops||{}).filter(k=>builder.ops[k]);
    if(opsSelected.length===0){setBuildErr("Select at least one operation.");return;}
    setBuildErr("");setBuilding(true);
    try{
      const runIndex=isDuplicateLot ? nextFamilyRunIndex : 1;
      for(const opKey of opsSelected){
        const remeasureIndex=isDuplicateLot
          ? runIndex
          : existingLotJobs.filter(j=>(normalizeOpNumber(j.operation)||String(j.operation))===(normalizeOpNumber(opKey)||String(opKey))).length+1;
        const opCode=normalizeOpNumber(opKey) || String(opKey).padStart(3,"0");
        const jobNumber=`${effectiveBaseId}${opCode}${String(remeasureIndex).padStart(2,"0")}`;
        if(jobs[jobNumber]){
          throw new Error(`Job number ${jobNumber} already exists. Generate a new base ID.`);
        }
        await onCreateJob({
          jobNumber,
          partNumber:builder.partNumber,
          partRevision:builder.partRevision,
          operation:opKey,
          lot:builder.lot,
          qty:parseInt(builder.qty),
          status:"open"
        });
      }
      setBuilder({partNumber:"",partRevision:"",lot:"",qty:"",ops:{}});
      setBaseId(newBaseId());
    }catch(e){
      setBuildErr(e?.message||"Unable to create jobs.");
    }finally{
      setBuilding(false);
    }
  }
  const sb=s=>{
    if(s==="open")return <span className="badge badge-open">Open</span>;
    if(s==="closed")return <span className="badge badge-closed">Closed</span>;
    if(s==="draft")return <span className="badge badge-draft">Draft</span>;
    if(s==="incomplete")return <span className="badge badge-incomplete">Incomplete</span>;
    return <span className="badge badge-pend">{s}</span>;
  };
  return (
    <div>
      <div className="card">
        <div className="card-head"><div className="card-title">Create New Job</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Job Number</label><input value={form.jobNumber} onChange={e=>setForm(p=>({...p,jobNumber:e.target.value.toUpperCase()}))} placeholder="J-10045" style={{fontFamily:"var(--mono)"}}/></div>
            <div className="field"><label>Part Number</label>
              <select value={form.partNumber} onChange={e=>{
                const nextPart=e.target.value;
                const nextRevision=parts[nextPart]?.currentRevision || "";
                setForm(p=>({...p,partNumber:nextPart,partRevision:nextRevision,operation:""}));
              }}>
                <option value="">— Select Part —</option>
                {Object.keys(parts).map(pn=><option key={pn} value={pn}>{pn} — {parts[pn].description}{parts[pn].currentRevision ? ` (Rev ${parts[pn].currentRevision})` : ""}</option>)}
              </select></div>
            <div className="field"><label>Revision</label>
              <select value={form.partRevision} onChange={e=>setForm(p=>({...p,partRevision:e.target.value}))} disabled={!form.partNumber}>
                <option value="">— Select Revision —</option>
                {(parts[form.partNumber]?.revisions||[]).map(r=><option key={r.revision} value={r.revision}>{r.revision}</option>)}
              </select></div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Operation</label>
              <select value={form.operation} onChange={e=>setForm(p=>({...p,operation:e.target.value}))} disabled={!form.partNumber}>
                <option value="">— Select Op —</option>
                {partOps.map(([k,op])=><option key={k} value={k}>Op {k} — {op.label}</option>)}
              </select></div>
            <div className="field"><label>Lot</label><input value={form.lot} onChange={e=>setForm(p=>({...p,lot:e.target.value}))} placeholder="e.g. Lot C"/></div>
            <div className="field"><label>Qty</label><input type="number" min="1" value={form.qty} onChange={e=>setForm(p=>({...p,qty:e.target.value}))} placeholder="12" style={{fontFamily:"var(--mono)"}}/></div>
          </div>
          {err&&<p className="err-text mt1">{err}</p>}
          <div className="mt2">
            <button className="btn btn-primary" disabled={saving||!canManageJobs} onClick={handleAdd}>{saving?"Creating…":"+ Create Job"}</button>
            {!canManageJobs && <span className="text-muted" style={{marginLeft:".65rem"}}>Permission required to create jobs.</span>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Job Builder (Part + Lot)</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Part Number</label>
              <select value={builder.partNumber} onChange={e=>{
                const nextPart=e.target.value;
                const nextRevision=parts[nextPart]?.currentRevision || "";
                setBuilder(p=>({...p,partNumber:nextPart,partRevision:nextRevision}));
              }}>
                <option value="">— Select Part —</option>
                {Object.keys(parts).map(pn=><option key={pn} value={pn}>{pn} — {parts[pn].description}{parts[pn].currentRevision ? ` (Rev ${parts[pn].currentRevision})` : ""}</option>)}
              </select></div>
            <div className="field"><label>Revision</label>
              <select value={builder.partRevision} onChange={e=>setBuilder(p=>({...p,partRevision:e.target.value}))} disabled={!builder.partNumber}>
                <option value="">— Select Revision —</option>
                {(parts[builder.partNumber]?.revisions||[]).map(r=><option key={r.revision} value={r.revision}>{r.revision}</option>)}
              </select></div>
            <div className="field"><label>Lot</label><input value={builder.lot} onChange={e=>setBuilder(p=>({...p,lot:e.target.value}))} placeholder="e.g. Lot B"/></div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Qty</label><input type="number" min="1" value={builder.qty} onChange={e=>setBuilder(p=>({...p,qty:e.target.value}))} placeholder="12" style={{fontFamily:"var(--mono)"}}/></div>
          </div>
          {isDuplicateLot && <div className="text-warn" style={{fontSize:".75rem",marginTop:".5rem"}}>Lot already exists — creating remeasure jobs.</div>}
          {isDuplicateLot && preferredBaseId && (
            <div className="text-muted" style={{fontSize:".74rem",marginTop:".3rem"}}>
              Reusing base job prefix <span className="mono">{preferredBaseId}</span> with run index <span className="mono">{String(nextFamilyRunIndex).padStart(2,"0")}</span> for this regenerated family.
            </div>
          )}
          <div className="row2 mt1">
            <div className="field"><label>Base Job ID</label>
              <div style={{display:"flex",gap:".5rem",alignItems:"center"}}>
                <input value={effectiveBaseId} readOnly style={{fontFamily:"var(--mono)"}}/>
                <button className="btn btn-ghost btn-sm" disabled={isDuplicateLot&&!!preferredBaseId} onClick={()=>setBaseId(newBaseId())}>Regenerate</button>
              </div>
            </div>
            <div className="field" style={{alignItems:"flex-end"}}>
              <div className="gap1">
                <button className="btn btn-ghost btn-sm" onClick={()=>setBuilder(p=>({...p,ops:Object.fromEntries(Object.keys(p.ops||{}).map(k=>[k,true]))}))}>Select All</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setBuilder(p=>({...p,ops:Object.fromEntries(Object.keys(p.ops||{}).map(k=>[k,false]))}))}>Clear</button>
              </div>
            </div>
          </div>
          <div className="section-label" style={{marginTop:".75rem"}}>Operations</div>
          <div className="row3">
            {builderOps.length===0 && <div className="text-muted">Select a part to choose operations.</div>}
            {builderOps.map(([opKey,op])=>{
              const remeasureIndex=isDuplicateLot
                ? nextFamilyRunIndex
                : existingLotJobs.filter(j=>(normalizeOpNumber(j.operation)||String(j.operation))===(normalizeOpNumber(opKey)||String(opKey))).length+1;
              const opCode=normalizeOpNumber(opKey) || String(opKey).padStart(3,"0");
              const jobNumber=`${effectiveBaseId}${opCode}${String(remeasureIndex).padStart(2,"0")}`;
              return (
                <label key={opKey} style={{display:"flex",alignItems:"center",gap:".5rem",fontSize:".85rem"}}>
                  <input type="checkbox" checked={!!builder.ops?.[opKey]} onChange={e=>setBuilder(p=>({...p,ops:{...p.ops,[opKey]:e.target.checked}}))}/>
                  Op {opKey} — {op.label} <span className="text-muted" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}>{jobNumber}</span>
                </label>
              );
            })}
          </div>
          {buildErr&&<p className="err-text mt1">{buildErr}</p>}
          <div className="mt2">
            <button className="btn btn-primary" disabled={building||!canManageJobs} onClick={handleBuild}>{building?"Creating…":"Create Jobs"}</button>
          </div>
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head"><div className="card-title">All Jobs</div></div>
        <table className="data-table">
          <thead><tr><th>Job #</th><th>Part</th><th>Rev</th><th>Operation</th><th>Lot</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>
            {Object.values(jobs).sort((a,b)=>b.jobNumber.localeCompare(a.jobNumber)).map(j=>(
              <tr key={j.jobNumber}>
                <td className="mono accent-text">{j.jobNumber}</td>
                <td><span className="mono">{j.partNumber}</span> <span className="text-muted">{parts[j.partNumber]?.description}</span></td>
                <td className="mono">{j.partRevision || "A"}</td>
                <td>Op {j.operation} — {parts[j.partNumber]?.operations[j.operation]?.label}</td>
                <td>{j.lot}</td><td className="mono">{j.qty}</td>
                <td>{sb(j.status)}
                  {j.lockOwnerUserId&&(
                    <div className="text-muted" style={{fontSize:".7rem"}}>Locked by {usersById?.[String(j.lockOwnerUserId)]||`User #${j.lockOwnerUserId}`}</div>
                  )}
                  {j.lockOwnerUserId && canManageJobs && onUnlockJob && (
                    <button className="btn btn-ghost btn-sm" style={{marginTop:".25rem"}} onClick={()=>onUnlockJob(j.jobNumber)}>Force Unlock</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecordDetailModal({ record, parts, toolLibrary, usersById, canEdit, onEditValue, onClose }) {
  const [localRecord,setLocalRecord]=useState(record);
  const [editTarget,setEditTarget]=useState(null);
  const [editValue,setEditValue]=useState("");
  const [editReason,setEditReason]=useState("");
  const [editErr,setEditErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [exportErr,setExportErr]=useState("");
  const [exporting,setExporting]=useState(false);
  useEffect(()=>{ setLocalRecord(record); },[record]);

  const part   = parts[localRecord.partNumber];
  const opData = part?.operations[localRecord.operation];
  const dims   = opData?.dimensions ?? [];
  const editDim = editTarget ? dims.find(d=>String(d.id)===String(editTarget.dimensionId)) : null;
  const editToolSel = editTarget
    ? (Array.isArray(localRecord.tools?.[String(editTarget.dimensionId)])
      ? localRecord.tools[String(editTarget.dimensionId)][0]
      : localRecord.tools?.[String(editTarget.dimensionId)])
    : null;
  const editTool = editToolSel ? toolLibrary[editToolSel.toolId] : null;
  const editMode = editTool?.type==="Go/No-Go" ? "gauge" : ((editDim?.inputMode||"single")==="range" ? "range" : "single");
  const [editRangeMin,editRangeMax] = splitRangeValue(editValue);
  function setEditRange(which, nextVal){
    const nextMin = which==="min" ? nextVal : editRangeMin;
    const nextMax = which==="max" ? nextVal : editRangeMax;
    const next = (nextMin || nextMax) ? `${nextMin}|${nextMax}` : "";
    setEditValue(next);
  }
  const operatorName = getOperatorName(localRecord, usersById);
  const allPieces = dims.length > 0
    ? [...new Set(dims.flatMap(d => getSamplePieces(d.sampling, localRecord.qty, d.samplingInterval)))].sort((a,b)=>a-b)
    : [];
  const resultBadge = localRecord.status==="incomplete"
    ? <span className="badge badge-incomplete">Incomplete</span>
    : localRecord.oot
      ? <span className="badge badge-oot">OOT</span>
      : <span className="badge badge-ok">OK</span>;
  async function handleEditSave(){
    if(!editTarget) return;
    if(!editReason.trim()){ setEditErr("Reason required for supervisor edits."); return; }
    if(!onEditValue){ setEditErr("Editing not available."); return; }
    let normalizedValue=String(editValue ?? "").trim();
    if(editMode==="gauge"){
      const v=normalizedValue.toUpperCase();
      if(v!=="PASS" && v!=="FAIL"){
        setEditErr("This dimension only allows PASS or FAIL corrections.");
        return;
      }
      normalizedValue=v;
    }else if(editMode==="range"){
      const [minStr,maxStr]=splitRangeValue(normalizedValue);
      if(!isValidNonNegativeNumber(minStr) || !isValidNonNegativeNumber(maxStr)){
        setEditErr("Range dimensions require numeric Min and Max values.");
        return;
      }
      normalizedValue=`${minStr}|${maxStr}`;
    }else{
      if(!isValidNonNegativeNumber(normalizedValue)){
        setEditErr("Numeric dimensions require a valid non-negative value.");
        return;
      }
    }
    setSaving(true);setEditErr("");
    try{
      const updated=await onEditValue({
        recordId: localRecord.id,
        dimensionId: editTarget.dimensionId,
        pieceNumber: editTarget.pieceNumber,
        value: normalizedValue,
        reason: editReason.trim()
      });
      if(updated) setLocalRecord(updated);
      setEditTarget(null);setEditValue("");setEditReason("");
    }catch(e){
      if(e?.message==="invalid_value_for_mode"){
        setEditErr("Value does not match the required input mode for this dimension.");
      }else{
        setEditErr(e?.message||"Unable to save edit.");
      }
    }finally{
      setSaving(false);
    }
  }
  async function handleExport(){
    setExportErr("");setExporting(true);
    try{
      const csv=await api.records.exportCsv(localRecord.id);
      const blob=new Blob([csv],{type:"text/csv"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`record_${localRecord.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }catch(e){
      setExportErr(e?.message||"Export failed.");
    }finally{
      setExporting(false);
    }
  }
  return (
    <div className="modal-overlay">
      <div className="rec-modal">
        <div className="rec-modal-head">
          <div>
            <div className="modal-title" style={{marginBottom:0}}>Inspection Record — {localRecord.jobNumber}</div>
            <div style={{fontSize:".72rem",color:"var(--muted)",marginTop:".2rem"}}>{localRecord.timestamp} · {operatorName || "—"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
            {resultBadge}
            <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>{exporting?"Exporting…":"Export CSV"}</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {exportErr&&<div className="err-text" style={{padding:"0 1.5rem"}}>{exportErr}</div>}
        <div className="rec-modal-body">
          <div className="rec-strip">
            <div className="rec-field"><div className="rec-label">Part</div><div className="rec-val">{localRecord.partNumber}</div></div>
            <div className="rec-field"><div className="rec-label">Description</div><div className="rec-val" style={{fontFamily:"var(--sans)",fontSize:".82rem",color:"var(--text)"}}>{part?.description}</div></div>
            <div className="rec-field"><div className="rec-label">Operation</div><div className="rec-val">Op {localRecord.operation} — <span style={{fontFamily:"var(--sans)",fontSize:".8rem",color:"var(--text)"}}>{opData?.label}</span></div></div>
            <div className="rec-field"><div className="rec-label">Lot</div><div className="rec-val">{localRecord.lot}</div></div>
            <div className="rec-field"><div className="rec-label">Qty</div><div className="rec-val">{localRecord.qty} pcs</div></div>
          </div>
          <div className="det-section">Tools Used</div>
          <table className="det-table" style={{marginBottom:"1.25rem"}}>
            <thead><tr><th>Dimension</th><th>Specification</th><th>Sampling</th><th>Tool</th><th>Type</th><th>IT #</th></tr></thead>
            <tbody>
              {dims.map(d => {
                const selectionsRaw = localRecord.tools?.[String(d.id)];
                const selections = Array.isArray(selectionsRaw) ? selectionsRaw : (selectionsRaw ? [selectionsRaw] : []);
                const mapped = selections.map(ts=>{
                  const tl = toolLibrary?.[ts?.toolId];
                  return {
                    name: tl?.name || ts?.toolName || "—",
                    type: tl?.type || ts?.toolType || "",
                    itNum: ts?.itNum || ""
                  };
                });
                const names = mapped.length ? mapped.map(m=>m.name).join(", ") : "—";
                const types = mapped.length ? [...new Set(mapped.map(m=>m.type).filter(Boolean))] : [];
                const typeLabel = types.length===0 ? "—" : types.length===1 ? types[0] : "Mixed";
                const itNums = mapped.length ? mapped.map(m=>m.itNum).filter(Boolean).join(", ") : "—";
                return (
                  <tr key={d.id}>
                    <td style={{fontWeight:600}}>{d.name}</td>
                    <td style={{fontFamily:"var(--mono)",fontSize:".78rem",color:"var(--muted)"}}>{fmtSpec(d)}</td>
                    <td><span className="sample-tag">{samplingLabel(d.sampling,d.samplingInterval)}</span></td>
                    <td>{names}</td>
                    <td>{typeLabel==="Mixed" ? <span className="badge badge-pend">Mixed</span> : (typeLabel==="—" ? "—" : <TypeBadge type={typeLabel}/>)}</td>
                    <td style={{fontFamily:"var(--mono)",fontSize:".78rem"}}>{itNums}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="det-section">Measurements</div>
          <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:"3px",marginBottom:"1.25rem"}}>
            <table className="det-table" style={{tableLayout:"auto"}}>
              <thead>
                <tr>
                  <th style={{minWidth:"60px"}}>Piece</th>
                  {dims.map(d=><th key={d.id}>{d.name}<div style={{fontFamily:"var(--mono)",fontSize:".6rem",color:"var(--border2)",fontWeight:400,marginTop:".1rem"}}>{fmtSpec(d)}</div><div style={{fontFamily:"var(--mono)",fontSize:".58rem",color:"var(--info)",fontWeight:500,marginTop:".15rem"}}>{samplingLabel(d.sampling,d.samplingInterval)}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {allPieces.map(pNum => {
                  const mp = localRecord.missingPieces?.[pNum];
                  return (
                    <tr key={pNum} style={mp?{background:"#180d0d"}:{}}>
                      <td style={{fontFamily:"var(--mono)",fontSize:".78rem",color:"var(--muted)",whiteSpace:"nowrap"}}>
                        Pc {pNum}
                        {mp && <div className="mp-tag">{mp.reason}{mp.ncNum&&` · ${mp.ncNum}`}</div>}
                      </td>
                      {dims.map(d => {
                        if(mp) return <td key={d.id} className="val-na">—</td>;
                        const inPlan = getSamplePieces(d.sampling, localRecord.qty, d.samplingInterval).includes(pNum);
                        const v = localRecord.values?.[`${d.id}_${pNum}`];
                        if(!inPlan && (v===undefined||v==="")) {
                          return <td key={d.id} className="val-na">n/a</td>;
                        }
                        const canEditCell = canEdit && v!==undefined && v!=="";
                        const isTarget = editTarget && String(editTarget.dimensionId)===String(d.id) && String(editTarget.pieceNumber)===String(pNum);
                        if(v==="PASS") return <td key={d.id} className={`val-ok${isTarget?" val-edit":""}`} onClick={()=>{if(canEditCell){setEditTarget({dimensionId:d.id,pieceNumber:pNum});setEditValue("PASS");setEditReason("");}}}>PASS</td>;
                        if(v==="FAIL") return <td key={d.id} className={`val-oot${isTarget?" val-edit":""}`} onClick={()=>{if(canEditCell){setEditTarget({dimensionId:d.id,pieceNumber:pNum});setEditValue("FAIL");setEditReason("");}}}>FAIL</td>;
                        if(v===undefined||v==="") return <td key={d.id} className="val-na">—</td>;
                        const oot = isOOT(v, d.tolPlus, d.tolMinus, d.nominal);
                        return (
                          <td key={d.id} className={`${oot?"val-oot":"val-ok"}${isTarget?" val-edit":""}`} onClick={()=>{if(canEditCell){setEditTarget({dimensionId:d.id,pieceNumber:pNum});setEditValue(String(v));setEditReason("");}}} style={canEditCell?{cursor:"pointer"}:{}}>
                            {formatValue(v, d)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit && !editTarget && (
            <div className="text-muted" style={{fontSize:".72rem",marginBottom:"1rem"}}>Supervisor edit: click a measurement value to change it.</div>
          )}
          {canEdit && editTarget && (
            <div style={{marginBottom:"1.25rem",border:"1px solid var(--border2)",borderRadius:"3px",padding:"1rem",background:"var(--panel)"}}>
              <div className="section-label" style={{marginBottom:".5rem"}}>Supervisor Edit</div>
              <div className="row3">
                <div className="field">
                  <label>Dimension</label>
                  <input value={dims.find(d=>String(d.id)===String(editTarget.dimensionId))?.name||`Dim ${editTarget.dimensionId}`} readOnly />
                </div>
                <div className="field">
                  <label>Piece</label>
                  <input value={`Pc ${editTarget.pieceNumber}`} readOnly />
                </div>
                <div className="field">
                  <label>Current Value</label>
                  <input value={localRecord.values?.[`${editTarget.dimensionId}_${editTarget.pieceNumber}`]||"—"} readOnly />
                </div>
              </div>
              <div className="field" style={{marginTop:".6rem"}}>
                <label>New Value</label>
                {editMode==="gauge"?(
                  <select value={String(editValue||"").toUpperCase()} onChange={e=>setEditValue(e.target.value.toUpperCase())}>
                    <option value="">Select…</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                ):editMode==="range"?(
                  <div style={{display:"flex",gap:".45rem"}}>
                    <input type="number" min="0" step="0.0001" placeholder="Min" value={editRangeMin} onChange={e=>setEditRange("min", e.target.value)} style={{flex:1}} />
                    <input type="number" min="0" step="0.0001" placeholder="Max" value={editRangeMax} onChange={e=>setEditRange("max", e.target.value)} style={{flex:1}} />
                  </div>
                ):(
                  <input type="number" min="0" step="0.0001" value={editValue} onChange={e=>setEditValue(e.target.value)} />
                )}
                <div className="text-muted" style={{fontSize:".7rem",marginTop:".3rem"}}>
                  {editMode==="gauge" ? "Correction mode: PASS/FAIL only." : editMode==="range" ? "Correction mode: numeric range (Min and Max required)." : "Correction mode: numeric value required."}
                </div>
              </div>
              <div className="field" style={{marginTop:".6rem"}}>
                <label>Reason (Required)</label>
                <input value={editReason} onChange={e=>setEditReason(e.target.value)} placeholder="Why is this being changed?" />
              </div>
              {editErr && <p className="err-text mt1">{editErr}</p>}
              <div className="gap1 mt2">
                <button className="btn btn-primary" disabled={saving} onClick={handleEditSave}>{saving?"Saving…":"Save Edit"}</button>
                <button className="btn btn-ghost" onClick={()=>{setEditTarget(null);setEditReason("");setEditValue("");}}>Cancel</button>
              </div>
            </div>
          )}
          {Object.keys(localRecord.missingPieces||{}).length > 0 && (
            <>
              <div className="det-section">Missing Piece Log</div>
              <table className="det-table" style={{marginBottom:"1.25rem"}}>
                <thead><tr><th>Piece</th><th>Reason</th><th>NC #</th><th>Details</th></tr></thead>
                <tbody>
                  {Object.entries(localRecord.missingPieces).map(([p,m])=>(
                    <tr key={p}>
                      <td className="mono">Pc {p}</td>
                      <td>{m.reason}</td>
                      <td className="mono">{m.ncNum||"—"}</td>
                      <td className="text-muted">{m.details||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {localRecord.comment && (
            <>
              <div className="det-section">{localRecord.oot?"OOT Comment":"Notes"}</div>
              <div style={{background:"var(--panel)",border:"1px solid var(--border2)",borderLeft:`3px solid ${localRecord.oot?"var(--warn)":"var(--border2)"}`,borderRadius:"3px",padding:".85rem 1.1rem",fontSize:".82rem",lineHeight:1.6,color:localRecord.oot?"#c07070":"var(--text)"}}>
                {localRecord.comment}
              </div>
            </>
          )}
          {(localRecord.auditLog||[]).length>0 && (
            <>
              <div className="det-section">Audit Log</div>
              <table className="det-table" style={{marginBottom:"1.25rem"}}>
                <thead><tr><th>Timestamp</th><th>User</th><th>Field</th><th>Before</th><th>After</th><th>Reason</th></tr></thead>
                <tbody>
                  {localRecord.auditLog.map(a=>(
                    <tr key={a.id}>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.timestamp}</td>
                      <td>{a.userName}</td>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.field}</td>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.beforeValue}</td>
                      <td className="mono" style={{fontSize:".72rem"}}>{a.afterValue}</td>
                      <td className="text-muted" style={{fontSize:".74rem"}}>{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminRecords({ records, parts, toolLibrary, usersById, loadRecordDetail, canEdit, onEditValue }) {
  const [filter,setFilter]=useState({part:"",op:"",lot:"",status:"",search:""});
  const [selected,setSelected]=useState(null);
  const [detailErr,setDetailErr]=useState("");
  const [loadingId,setLoadingId]=useState(null);
  const [exporting,setExporting]=useState(false);
  const [exportErr,setExportErr]=useState("");
  const [sortKey,setSortKey]=useState("timestamp");
  const [sortDir,setSortDir]=useState("desc");
  const allOps=[...new Set(records.map(r=>r.operation))].sort();
  const filtered=records.filter(r=>{
    const matchesPart=(!filter.part||r.partNumber.includes(filter.part));
    const matchesOp=(!filter.op||r.operation===filter.op);
    const matchesLot=(!filter.lot||String(r.lot).toLowerCase().includes(String(filter.lot).toLowerCase()));
    const matchesStatus=(!filter.status||r.status===filter.status||(filter.status==="oot"&&r.oot));
    const search=filter.search.trim().toLowerCase();
    if(!search) return matchesPart&&matchesOp&&matchesLot&&matchesStatus;
    const hay=[
      r.jobNumber,
      r.partNumber,
      r.lot,
      String(r.operation),
      getOperatorName(r, usersById),
      r.comment||"",
      r.status
    ].join(" ").toLowerCase();
    return matchesPart&&matchesOp&&matchesLot&&matchesStatus&&hay.includes(search);
  });
  const sorted=[...filtered].sort((a,b)=>{
    const dir=sortDir==="asc"?1:-1;
    const getVal=(r)=>{
      if(sortKey==="timestamp") return new Date(r.timestamp).getTime()||0;
      if(sortKey==="jobNumber") return r.jobNumber||"";
      if(sortKey==="partNumber") return r.partNumber||"";
      if(sortKey==="operation") return String(r.operation||"");
      if(sortKey==="lot") return r.lot||"";
      if(sortKey==="qty") return Number(r.qty||0);
      if(sortKey==="operator") return getOperatorName(r, usersById)||"";
      if(sortKey==="result") return r.oot?"oot":r.status||"";
      return "";
    };
    const av=getVal(a);
    const bv=getVal(b);
    if(typeof av==="number"&&typeof bv==="number") return (av-bv)*dir;
    return String(av).localeCompare(String(bv))*dir;
  });
  const sb=r=>{
    if(r.status==="incomplete")return <span className="badge badge-incomplete">Incomplete</span>;
    if(r.oot)return <span className="badge badge-oot">OOT</span>;
    return <span className="badge badge-ok">OK</span>;
  };
  function toggleSort(key){
    if(sortKey===key){ setSortDir(d=>d==="asc"?"desc":"asc"); }
    else{ setSortKey(key); setSortDir("asc"); }
  }
  function sortIcon(key){
    if(sortKey!==key) return "";
    return sortDir==="asc"?"↑":"↓";
  }
  async function handleSelect(r){
    setDetailErr("");
    if(!loadRecordDetail || (r.values && Object.keys(r.values).length>0)){
      setSelected(r);
      return;
    }
    setLoadingId(r.id);
    try{
      const detail = await loadRecordDetail(r.id);
      setSelected(detail || r);
    }catch(err){
      setDetailErr(err?.message || "Unable to load record detail.");
      setSelected(r);
    }finally{
      setLoadingId(null);
    }
  }
  async function handleEdit(payload){
    if(!onEditValue) return null;
    const updated=await onEditValue(payload);
    if(updated) setSelected(updated);
    return updated;
  }
  function csvEscape(v){
    const s=(v??"").toString();
    if(s.includes(",")||s.includes("\"")||s.includes("\n")) return `"${s.replace(/\"/g,'""')}"`;
    return s;
  }
  async function handleExportFiltered(){
    if(!loadRecordDetail) return;
    setExportErr("");setExporting(true);
    try{
      const lines=[];
      const header=["Job #","Part","Operation","Lot","Qty","Piece","Dimension","Sampling Plan","Value","Is OOT","Tool","IT #","Operator","Timestamp","Status","Comment","Override Count","Last Override By","Last Override Timestamp","Override Reason","Prior Value","Corrected Value","Missing Reason","Missing Details"];
      lines.push(header.join(","));
      for(const r of sorted){
        const detail = (r.values && Object.keys(r.values).length>0) ? r : await loadRecordDetail(r.id);
        const part = parts[detail.partNumber];
        const opData = part?.operations?.[detail.operation];
        const dims = opData?.dimensions || [];
        const dimMap = new Map(dims.map(d=>[String(d.id),d]));
        const toolMap = detail.tools || {};
        const auditByField = new Map();
        (detail.auditLog || []).forEach(a=>{
          const fieldKey=String(a.field || "");
          if(!auditByField.has(fieldKey)) auditByField.set(fieldKey, []);
          auditByField.get(fieldKey).push(a);
        });
        for(const [key,val] of Object.entries(detail.values||{})){
          const [dimId,pieceStr]=key.split("_");
          const d=dimMap.get(String(dimId));
          const toolRowsRaw=toolMap?.[String(dimId)];
          const toolRows=Array.isArray(toolRowsRaw) ? toolRowsRaw : (toolRowsRaw ? [toolRowsRaw] : []);
          const toolNames=toolRows.map(ts=>toolLibrary?.[ts?.toolId]?.name || ts?.toolName || "").filter(Boolean).join(" | ");
          const itNums=toolRows.map(ts=>ts?.itNum || "").filter(Boolean).join(" | ");
          const oot=isOOT(val,d?.tolPlus??0,d?.tolMinus??0,d?.nominal??0);
          const editKey=`dim:${dimId}|piece:${pieceStr}`;
          const edits=auditByField.get(editKey) || [];
          const latestEdit=edits[0] || null;
          const row=[
            detail.jobNumber,
            detail.partNumber,
            detail.operation,
            detail.lot,
            detail.qty,
            pieceStr,
            d?.name||`Dim ${dimId}`,
            d?.sampling ? samplingLabel(d.sampling,d?.samplingInterval) : "",
            val,
            oot===true?"Yes":oot===false?"No":"",
            toolNames,
            itNums,
            getOperatorName(detail, usersById),
            detail.timestamp,
            detail.status,
            detail.comment||"",
            edits.length,
            latestEdit?.userName || "",
            latestEdit?.timestamp || "",
            latestEdit?.reason || "",
            latestEdit?.beforeValue || "",
            latestEdit?.afterValue || "",
            "",
            ""
          ];
          lines.push(row.map(csvEscape).join(","));
        }
        for(const [piece,info] of Object.entries(detail.missingPieces||{})){
          const row=[
            detail.jobNumber,
            detail.partNumber,
            detail.operation,
            detail.lot,
            detail.qty,
            piece,
            "",
            "",
            "",
            "",
            "",
            "",
            getOperatorName(detail, usersById),
            detail.timestamp,
            detail.status,
            detail.comment||"",
            "",
            "",
            "",
            "",
            "",
            "",
            info.reason||"",
            info.details||info.ncNum||""
          ];
          lines.push(row.map(csvEscape).join(","));
        }
      }
      const csv=lines.join("\n");
      const blob=new Blob([csv],{type:"text/csv"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`records_export_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }catch(e){
      setExportErr(e?.message||"Export failed.");
    }finally{
      setExporting(false);
    }
  }
  return (
    <div>
      {selected && <RecordDetailModal record={selected} parts={parts} toolLibrary={toolLibrary} usersById={usersById} canEdit={canEdit} onEditValue={handleEdit} onClose={()=>setSelected(null)}/>}
      <div className="card">
        <div className="card-head"><div className="card-title">Filter</div></div>
        <div className="card-body">
          <div className="row2" style={{marginBottom:".75rem"}}>
            <div className="field" style={{gridColumn:"span 2"}}>
              <label>Search</label>
              <input placeholder="Search job, part, lot, operator, comment…" value={filter.search} onChange={e=>setFilter(p=>({...p,search:e.target.value}))}/>
            </div>
          </div>
          <div className="row3">
            <div className="field"><label>Part #</label><input placeholder="All" value={filter.part} onChange={e=>setFilter(p=>({...p,part:e.target.value}))}/></div>
            <div className="field"><label>Operation</label>
              <select value={filter.op} onChange={e=>setFilter(p=>({...p,op:e.target.value}))}>
                <option value="">All</option>{allOps.map(o=><option key={o} value={o}>Op {o}</option>)}
              </select></div>
            <div className="field"><label>Lot</label><input placeholder="All" value={filter.lot} onChange={e=>setFilter(p=>({...p,lot:e.target.value}))}/></div>
          </div>
          <div className="row2 mt1">
            <div className="field"><label>Result</label>
              <select value={filter.status} onChange={e=>setFilter(p=>({...p,status:e.target.value}))}>
                <option value="">All</option><option value="complete">Complete/OK</option><option value="oot">OOT</option><option value="incomplete">Incomplete</option>
              </select></div>
          </div>
          {detailErr && <p className="err-text mt1">{detailErr}</p>}
          {loadingId && <p className="text-muted mt1" style={{fontSize:".75rem"}}>Loading record detail…</p>}
        </div>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div className="card-head">
          <div className="card-title">Records</div>
          <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
            <div className="text-muted" style={{fontSize:".7rem"}}>Click any row to view full detail</div>
            <button className="btn btn-ghost btn-sm" onClick={handleExportFiltered} disabled={exporting||sorted.length===0}>
              {exporting?"Exporting…":"Export Filtered CSV"}
            </button>
          </div>
        </div>
        {exportErr && <div className="err-text" style={{padding:"0 .85rem"}}>{exportErr}</div>}
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={()=>toggleSort("timestamp")} style={{cursor:"pointer"}}>Timestamp {sortIcon("timestamp")}</th>
              <th onClick={()=>toggleSort("jobNumber")} style={{cursor:"pointer"}}>Job # {sortIcon("jobNumber")}</th>
              <th onClick={()=>toggleSort("partNumber")} style={{cursor:"pointer"}}>Part {sortIcon("partNumber")}</th>
              <th onClick={()=>toggleSort("operation")} style={{cursor:"pointer"}}>Op {sortIcon("operation")}</th>
              <th onClick={()=>toggleSort("lot")} style={{cursor:"pointer"}}>Lot {sortIcon("lot")}</th>
              <th onClick={()=>toggleSort("qty")} style={{cursor:"pointer"}}>Qty {sortIcon("qty")}</th>
              <th onClick={()=>toggleSort("operator")} style={{cursor:"pointer"}}>Operator {sortIcon("operator")}</th>
              <th onClick={()=>toggleSort("result")} style={{cursor:"pointer"}}>Result {sortIcon("result")}</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length===0&&<tr><td colSpan={9}><div className="empty-state">No records match.</div></td></tr>}
            {sorted.map(r=>(
              <tr key={r.id} className="tr-click" onClick={()=>handleSelect(r)}>
                <td className="mono" style={{fontSize:".74rem",whiteSpace:"nowrap"}}>{r.timestamp}</td>
                <td className="mono accent-text">{r.jobNumber}</td><td className="mono">{r.partNumber}</td>
                <td>Op {r.operation}</td><td>{r.lot}</td><td className="mono">{r.qty}</td>
                <td>{getOperatorName(r, usersById)}</td><td>{sb(r)}</td>
                <td className="text-muted" style={{fontSize:".74rem",maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.comment||"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted">{sorted.length} record{sorted.length!==1?"s":""}</p>
    </div>
  );
}

function AdminIssueReports({ currentRole, currentUserId }) {
  const [statusFilter,setStatusFilter]=useState("open");
  const [issues,setIssues]=useState([]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [resolvingId,setResolvingId]=useState(null);

  async function loadIssues(nextStatus=statusFilter){
    setLoading(true);
    setErr("");
    try{
      const filters=nextStatus ? { status: nextStatus } : {};
      const rows=await api.issues.list(filters, currentRole || "Admin");
      setIssues(rows||[]);
    }catch(e){
      setErr(e?.message||"Unable to load issue reports.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    loadIssues(statusFilter);
  },[statusFilter,currentRole]);

  async function markCompleted(issueId){
    if(!currentUserId){
      setErr("Select a current user before resolving reports.");
      return;
    }
    setResolvingId(issueId);
    setErr("");
    try{
      await api.issues.complete(issueId, { userId:Number(currentUserId), resolutionNote:"Reviewed and completed." }, currentRole || "Admin");
      await loadIssues(statusFilter);
    }catch(e){
      setErr(e?.message||"Unable to mark issue as completed.");
    }finally{
      setResolvingId(null);
    }
  }

  function categoryLabel(category){
    return ISSUE_CATEGORIES.find(c=>c.value===category)?.label || category;
  }

  return (
    <div className="card" style={{padding:0,overflow:"hidden"}}>
      <div className="card-head">
        <div className="card-title">Operator Issue Reports</div>
        <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{minWidth:"140px"}}>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="">All</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={()=>loadIssues(statusFilter)} disabled={loading}>
            {loading?"Refreshing…":"Refresh"}
          </button>
        </div>
      </div>
      {err && <div className="err-text" style={{padding:"0 .85rem .6rem"}}>{err}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Category</th>
            <th>Submitted By</th>
            <th>Submitted At</th>
            <th>Context</th>
            <th>Details</th>
            <th>Resolution</th>
          </tr>
        </thead>
        <tbody>
          {issues.length===0 && <tr><td colSpan={8}><div className="empty-state">{loading?"Loading reports…":"No issue reports found."}</div></td></tr>}
          {issues.map(i=>{
            const context = [i.part_id ? `Part ${i.part_id}` : "", i.job_id ? `Job ${i.job_id}` : "", i.operation_id ? `Op ${i.operation_id}` : ""].filter(Boolean).join(" · ");
            return (
              <tr key={i.id}>
                <td className="mono">{i.id}</td>
                <td>{i.status==="completed" ? <span className="badge badge-ok">Completed</span> : <span className="badge badge-open">Open</span>}</td>
                <td>{categoryLabel(i.category)}</td>
                <td>{i.submitted_by_name || `User #${i.submitted_by_user_id}`}</td>
                <td className="mono" style={{fontSize:".74rem",whiteSpace:"nowrap"}}>{fmtTs(i.submitted_at)}</td>
                <td className="text-muted" style={{fontSize:".74rem"}}>{context || "—"}</td>
                <td style={{maxWidth:"360px",whiteSpace:"normal",lineHeight:1.4}}>{i.details}</td>
                <td>
                  {i.status==="completed" ? (
                    <div style={{fontSize:".74rem"}}>
                      <div>{i.resolved_by_name || (i.resolved_by_user_id ? `User #${i.resolved_by_user_id}` : "—")}</div>
                      <div className="text-muted mono" style={{fontSize:".7rem"}}>{fmtTs(i.resolved_at)}</div>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={()=>markCompleted(i.id)} disabled={resolvingId===i.id}>
                      {resolvingId===i.id ? "Updating…" : "Mark Complete"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdminImports({ currentRole, canManageTools, canManageParts, canManageJobs, onRefreshData }) {
  const [templates,setTemplates]=useState(null);
  const [loadingTemplates,setLoadingTemplates]=useState(false);
  const [toolsCsv,setToolsCsv]=useState("");
  const [partDimsCsv,setPartDimsCsv]=useState("");
  const [jobsCsv,setJobsCsv]=useState("");
  const [measurementsCsv,setMeasurementsCsv]=useState("");
  const [running,setRunning]=useState("");
  const [err,setErr]=useState("");
  const [result,setResult]=useState("");
  const [activeUploadTarget,setActiveUploadTarget]=useState("tools");
  const fileInputRef=useRef(null);
  const [integrations,setIntegrations]=useState([]);
  const [loadingIntegrations,setLoadingIntegrations]=useState(false);
  const [integrationBusy,setIntegrationBusy]=useState("");
  const [integrationForm,setIntegrationForm]=useState({
    name:"",
    sourceType:"api_pull",
    importType:"jobs",
    endpointUrl:"",
    pollIntervalMinutes:"",
    enabled:true
  });
  const [unresolved,setUnresolved]=useState([]);
  const [loadingUnresolved,setLoadingUnresolved]=useState(false);
  const [unresolvedBusy,setUnresolvedBusy]=useState("");
  const [resolveEdits,setResolveEdits]=useState({});

  useEffect(()=>{
    let active=true;
    async function loadAll(){
      setLoadingTemplates(true);
      setLoadingIntegrations(true);
      setLoadingUnresolved(true);
      try{
        const [rows, integrationRows, unresolvedRows]=await Promise.all([
          api.imports.templates(currentRole || "Admin"),
          api.imports.integrations(currentRole || "Admin"),
          api.imports.unresolved(currentRole || "Admin", { status:"open", limit:100 })
        ]);
        if(!active) return;
        setTemplates(rows);
        setIntegrations(integrationRows||[]);
        setUnresolved(unresolvedRows||[]);
      }catch{
        if(!active) return;
      }finally{
        if(active){
          setLoadingTemplates(false);
          setLoadingIntegrations(false);
          setLoadingUnresolved(false);
        }
      }
    }
    loadAll();
    return ()=>{ active=false; };
  },[currentRole]);

  async function refreshIntegrations(){
    setLoadingIntegrations(true);
    try{
      const rows=await api.imports.integrations(currentRole || "Admin");
      setIntegrations(rows||[]);
    }finally{
      setLoadingIntegrations(false);
    }
  }

  async function refreshUnresolved(){
    setLoadingUnresolved(true);
    try{
      const rows=await api.imports.unresolved(currentRole || "Admin", { status:"open", limit:100 });
      setUnresolved(rows||[]);
    }finally{
      setLoadingUnresolved(false);
    }
  }

  function buildTemplateCsv(kind){
    const headers=kind==="tools"
      ? (templates?.tools?.headers || [])
      : kind==="partDimensions"
        ? (templates?.partDimensions?.headers || [])
        : kind==="jobs"
          ? (templates?.jobs?.headers || [])
          : kind==="measurements"
            ? (templates?.measurements?.headers || [])
            : (templates?.operatorMeasurement?.headers || []);
    if(!headers.length) return "";
    const sampleRow=kind==="tools"
      ? ["Outside Micrometer","Variable","IT-1001","0-4 in","true","true"]
      : kind==="partDimensions"
        ? ["1234","Hydraulic Cylinder Body","010","Rough Turn","Outer Diameter","1.0000","0.0050","0.0050","in","first_middle_last","","single","IT-0042|IT-0018"]
        : kind==="jobs"
          ? ["J-IMP-1001","1234","A","","020","Lot X",12,"open"]
          : kind==="measurements"
            ? ["batch-001","J-10042","1234","A","020",1,"Bore Diameter","0.6250","false",1,"complete","Imported from CMM","IT-0031","","",""]
            : [1,"Bore Diameter","0.6250","false","IT-0031","","",""];
    return `${headers.join(",")}\n${sampleRow.slice(0, headers.length).join(",")}`;
  }

  function downloadTemplate(kind){
    const csv=buildTemplateCsv(kind);
    if(!csv){
      setErr("Template headers are not available.");
      return;
    }
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=kind==="tools"
      ? "tools-import-template.csv"
      : kind==="partDimensions"
        ? "part-dimensions-import-template.csv"
        : kind==="jobs"
          ? "jobs-import-template.csv"
          : kind==="measurements"
            ? "measurements-import-template.csv"
            : "operator-measurements-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport(kind){
    if(running) return;
    const csvText=(kind==="tools"
      ? toolsCsv
      : kind==="partDimensions"
        ? partDimsCsv
        : kind==="jobs"
          ? jobsCsv
          : measurementsCsv).trim();
    if(!csvText){
      setErr("Paste CSV text or upload a CSV file first.");
      return;
    }
    setErr("");
    setResult("");
    setRunning(kind);
    try{
      const response=kind==="tools"
        ?await api.imports.toolsCsv(csvText, currentRole || "Admin")
        :kind==="partDimensions"
          ?await api.imports.partDimensionsCsv(csvText, currentRole || "Admin")
          :kind==="jobs"
            ?await api.imports.jobsCsv(csvText, currentRole || "Admin")
            :await api.imports.measurementsBulk({ csvText }, currentRole || "Admin");
      setResult(JSON.stringify(response, null, 2));
      if(onRefreshData) await onRefreshData();
      await refreshUnresolved();
    }catch(e){
      setErr(e?.message || "Import failed.");
    }finally{
      setRunning("");
    }
  }

  function triggerUpload(target){
    setActiveUploadTarget(target);
    if(fileInputRef.current) fileInputRef.current.click();
  }

  function handleCsvUpload(e){
    const file=e.target.files?.[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const text=String(reader.result || "");
      if(activeUploadTarget==="tools") setToolsCsv(text);
      else if(activeUploadTarget==="partDimensions") setPartDimsCsv(text);
      else if(activeUploadTarget==="jobs") setJobsCsv(text);
      else setMeasurementsCsv(text);
    };
    reader.readAsText(file);
    e.target.value="";
  }

  async function saveIntegration(){
    if(integrationBusy) return;
    if(!integrationForm.name.trim()){
      setErr("Integration name is required.");
      return;
    }
    setErr("");
    setIntegrationBusy("save");
    try{
      await api.imports.createIntegration({
        name:integrationForm.name.trim(),
        sourceType:integrationForm.sourceType,
        importType:integrationForm.importType,
        endpointUrl:integrationForm.endpointUrl.trim()||null,
        pollIntervalMinutes:integrationForm.pollIntervalMinutes?Number(integrationForm.pollIntervalMinutes):null,
        enabled:integrationForm.enabled
      }, currentRole || "Admin");
      setIntegrationForm({ name:"", sourceType:"api_pull", importType:"jobs", endpointUrl:"", pollIntervalMinutes:"", enabled:true });
      await refreshIntegrations();
    }catch(e){
      setErr(e?.message || "Unable to save integration.");
    }finally{
      setIntegrationBusy("");
    }
  }

  async function pullIntegration(integrationId){
    if(integrationBusy) return;
    setErr("");
    setResult("");
    setIntegrationBusy(String(integrationId));
    try{
      const response=await api.imports.pullIntegration(integrationId, {}, currentRole || "Admin");
      setResult(JSON.stringify(response, null, 2));
      if(onRefreshData) await onRefreshData();
      await Promise.all([refreshIntegrations(), refreshUnresolved()]);
    }catch(e){
      setErr(e?.message || "Integration pull failed.");
    }finally{
      setIntegrationBusy("");
    }
  }

  function editForUnresolved(item){
    if(resolveEdits[item.id]) return resolveEdits[item.id];
    const inferred=item.payload?.inferred || {};
    return {
      jobId: inferred.jobId || "",
      operationId: inferred.operationId || "",
      partId: inferred.partId || "",
      operatorUserId: inferred.operatorUserId || "",
      dimensionId: inferred.dimensionId || "",
      dimensionName: inferred.dimensionName || "",
      pieceNumber: inferred.pieceNumber || "",
      value: inferred.value || "",
      status: inferred.status || "",
      comment: inferred.comment || "",
      missingReason: inferred.missingReason || "",
      ncNum: inferred.ncNum || "",
      details: inferred.details || ""
    };
  }

  function setUnresolvedEdit(id, patch){
    const item=unresolved.find(u=>u.id===id);
    const base=item?editForUnresolved(item):{};
    setResolveEdits(prev=>({ ...prev, [id]: { ...base, ...prev[id], ...patch } }));
  }

  async function resolveUnresolved(item){
    if(unresolvedBusy) return;
    const edit=editForUnresolved(item);
    setUnresolvedBusy(`resolve_${item.id}`);
    try{
      await api.imports.resolveUnresolved(item.id, { assignment: edit }, currentRole || "Admin");
      await Promise.all([refreshUnresolved(), onRefreshData ? onRefreshData() : Promise.resolve()]);
    }catch(e){
      setErr(e?.message || "Unable to resolve item.");
    }finally{
      setUnresolvedBusy("");
    }
  }

  async function ignoreUnresolved(item){
    if(unresolvedBusy) return;
    setUnresolvedBusy(`ignore_${item.id}`);
    try{
      await api.imports.ignoreUnresolved(item.id, {}, currentRole || "Admin");
      await refreshUnresolved();
    }catch(e){
      setErr(e?.message || "Unable to ignore item.");
    }finally{
      setUnresolvedBusy("");
    }
  }

  return (
    <div className="stack1">
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={handleCsvUpload}/>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Data Imports</div>
          <div className="text-muted" style={{fontSize:".72rem"}}>
            {loadingTemplates ? "Loading templates…" : "Use templates to import tools, part dimensions, jobs, and measurement data via CSV."}
          </div>
        </div>
        <div className="card-body">
          {err && <div className="err-text">{err}</div>}
          {result && (
            <pre style={{margin:0,padding:".7rem",background:"var(--bg-soft)",border:"1px solid var(--border)",borderRadius:"10px",fontSize:".72rem",overflowX:"auto"}}>{result}</pre>
          )}
          <div className="row2 mt1">
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Tools CSV Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Upsert tools by name, IT #, type, and visibility fields.</p>
                <textarea value={toolsCsv} onChange={e=>setToolsCsv(e.target.value)} rows={8} placeholder="Paste tools CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("tools")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setToolsCsv(buildTemplateCsv("tools"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("tools")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageTools || running==="tools"} onClick={()=>runImport("tools")}>
                    {running==="tools" ? "Importing…" : "Run Tool Import"}
                  </button>
                </div>
                {!canManageTools && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_tools`.</div>}
              </div>
            </div>
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Part Dimensions CSV Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Upsert part, operation, and dimension definitions including sampling plan and input mode.</p>
                <textarea value={partDimsCsv} onChange={e=>setPartDimsCsv(e.target.value)} rows={8} placeholder="Paste part dimensions CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("partDimensions")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setPartDimsCsv(buildTemplateCsv("partDimensions"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("partDimensions")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageParts || running==="partDimensions"} onClick={()=>runImport("partDimensions")}>
                    {running==="partDimensions" ? "Importing…" : "Run Part Import"}
                  </button>
                </div>
                {!canManageParts && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_parts`.</div>}
              </div>
            </div>
          </div>
          <div className="row2 mt1">
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Jobs CSV Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Create or update jobs with part/revision/operation validation and row-level error feedback.</p>
                <textarea value={jobsCsv} onChange={e=>setJobsCsv(e.target.value)} rows={8} placeholder="Paste jobs CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("jobs")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setJobsCsv(buildTemplateCsv("jobs"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("jobs")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageJobs || running==="jobs"} onClick={()=>runImport("jobs")}>
                    {running==="jobs" ? "Importing…" : "Run Job Import"}
                  </button>
                </div>
                {!canManageJobs && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_jobs`.</div>}
              </div>
            </div>
            <div className="card" style={{margin:0}}>
              <div className="card-head"><div className="card-title">Measurement Bulk Import</div></div>
              <div className="card-body">
                <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Ingest multi-job and multi-operation measurement rows from CMM/API/webhook exports. Ambiguous rows route to Unresolved Imports.</p>
                <textarea value={measurementsCsv} onChange={e=>setMeasurementsCsv(e.target.value)} rows={8} placeholder="Paste measurement CSV here…" style={{fontFamily:"var(--mono)",fontSize:".72rem"}}/>
                <div className="gap1 mt1">
                  <button className="btn btn-ghost btn-sm" onClick={()=>downloadTemplate("measurements")}>Download Template</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setMeasurementsCsv(buildTemplateCsv("measurements"))}>Load Sample</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>triggerUpload("measurements")}>Upload CSV</button>
                  <button className="btn btn-primary btn-sm" disabled={!canManageJobs || running==="measurements"} onClick={()=>runImport("measurements")}>
                    {running==="measurements" ? "Importing…" : "Run Measurement Import"}
                  </button>
                </div>
                {!canManageJobs && <div className="text-muted" style={{fontSize:".72rem",marginTop:".4rem"}}>Permission required: `manage_jobs`.</div>}
              </div>
            </div>
          </div>
          <div className="card mt1" style={{margin:0}}>
            <div className="card-head">
              <div className="card-title">Import Integrations (API / Webhook / Excel)</div>
              <div className="text-muted" style={{fontSize:".72rem"}}>{loadingIntegrations ? "Loading…" : `${integrations.length} configured`}</div>
            </div>
            <div className="card-body">
              <div className="row3">
                <div className="field"><label>Name</label><input value={integrationForm.name} onChange={e=>setIntegrationForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Customer A Jobs Feed"/></div>
                <div className="field"><label>Source</label>
                  <select value={integrationForm.sourceType} onChange={e=>setIntegrationForm(p=>({...p,sourceType:e.target.value}))}>
                    <option value="api_pull">API Pull</option>
                    <option value="webhook">Webhook</option>
                    <option value="excel_sheet">Live Excel Sheet</option>
                  </select>
                </div>
                <div className="field"><label>Import Type</label>
                  <select value={integrationForm.importType} onChange={e=>setIntegrationForm(p=>({...p,importType:e.target.value}))}>
                    <option value="tools">Tools</option>
                    <option value="part_dimensions">Part Dimensions</option>
                    <option value="jobs">Jobs</option>
                    <option value="measurements">Measurements</option>
                  </select>
                </div>
              </div>
              <div className="row3 mt1">
                <div className="field"><label>Endpoint URL</label><input value={integrationForm.endpointUrl} onChange={e=>setIntegrationForm(p=>({...p,endpointUrl:e.target.value}))} placeholder="https://example.com/feed.csv"/></div>
                <div className="field"><label>Poll Interval (min)</label><input type="number" min="1" value={integrationForm.pollIntervalMinutes} onChange={e=>setIntegrationForm(p=>({...p,pollIntervalMinutes:e.target.value}))} placeholder="15"/></div>
                <div className="field" style={{display:"flex",alignItems:"flex-end"}}>
                  <label style={{display:"flex",gap:".45rem",alignItems:"center",marginBottom:".3rem"}}>
                    <input type="checkbox" checked={integrationForm.enabled!==false} onChange={e=>setIntegrationForm(p=>({...p,enabled:e.target.checked}))}/>
                    Enabled
                  </label>
                </div>
              </div>
              <div className="mt1">
                <button className="btn btn-primary btn-sm" disabled={!canManageJobs || integrationBusy==="save"} onClick={saveIntegration}>
                  {integrationBusy==="save" ? "Saving…" : "Add Integration"}
                </button>
              </div>
              <table className="data-table mt1">
                <thead><tr><th>Name</th><th>Source</th><th>Type</th><th>Endpoint</th><th>Poll</th><th>Last Run</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {integrations.length===0&&<tr><td colSpan={8}><div className="empty-state">No integrations configured.</div></td></tr>}
                  {integrations.map(integ=>(
                    <tr key={integ.id}>
                      <td style={{fontWeight:600}}>{integ.name}</td>
                      <td className="mono" style={{fontSize:".74rem"}}>{integ.source_type}</td>
                      <td className="mono" style={{fontSize:".74rem"}}>{integ.import_type}</td>
                      <td className="mono" style={{fontSize:".7rem",maxWidth:"340px",whiteSpace:"normal"}}>{integ.endpoint_url || "—"}</td>
                      <td className="mono">{integ.poll_interval_minutes || "—"}</td>
                      <td className="mono" style={{fontSize:".7rem"}}>{integ.last_run_at ? fmtTs(integ.last_run_at) : "—"}</td>
                      <td>{integ.last_status ? <span className={`badge ${integ.last_status==="success"?"badge-ok":integ.last_status==="partial"?"badge-pend":"badge-incomplete"}`}>{integ.last_status}</span> : "—"}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" disabled={!canManageJobs || integrationBusy===String(integ.id)} onClick={()=>pullIntegration(integ.id)}>
                          {integrationBusy===String(integ.id) ? "Running…" : "Pull Now"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card mt1" style={{margin:0}}>
            <div className="card-head">
              <div className="card-title">Unresolved Imports</div>
              <div className="text-muted" style={{fontSize:".72rem"}}>{loadingUnresolved ? "Loading…" : `${unresolved.length} open`}</div>
            </div>
            <div className="card-body">
              <p className="text-muted" style={{marginTop:0,fontSize:".74rem"}}>Rows with low confidence or missing mappings appear here. Override fields and resolve manually, or ignore if not needed.</p>
              <div className="mt1" style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
                {unresolved.length===0 && <div className="empty-state">No unresolved import rows.</div>}
                {unresolved.map(item=>{
                  const edit=editForUnresolved(item);
                  const busyResolve=unresolvedBusy===`resolve_${item.id}`;
                  const busyIgnore=unresolvedBusy===`ignore_${item.id}`;
                  return (
                    <div key={item.id} style={{border:"1px solid var(--border)",borderRadius:"8px",padding:".65rem"}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:".5rem",alignItems:"center"}}>
                        <div style={{fontSize:".76rem"}}>
                          <span className="mono">#{item.id}</span> · <span className="text-warn">{item.reason}</span> · line {item.line_number || "?"}
                        </div>
                        <div className="mono" style={{fontSize:".68rem",opacity:.7}}>conf {item.confidence || "n/a"}</div>
                      </div>
                      <div className="row3 mt1">
                        <input value={edit.jobId} onChange={e=>setUnresolvedEdit(item.id,{jobId:e.target.value})} placeholder="job id"/>
                        <input value={edit.operationId} onChange={e=>setUnresolvedEdit(item.id,{operationId:e.target.value})} placeholder="operation id"/>
                        <input value={edit.partId} onChange={e=>setUnresolvedEdit(item.id,{partId:e.target.value})} placeholder="part id"/>
                      </div>
                      <div className="row3 mt1">
                        <input value={edit.dimensionId} onChange={e=>setUnresolvedEdit(item.id,{dimensionId:e.target.value})} placeholder="dimension id"/>
                        <input value={edit.dimensionName} onChange={e=>setUnresolvedEdit(item.id,{dimensionName:e.target.value})} placeholder="dimension name"/>
                        <input value={edit.pieceNumber} onChange={e=>setUnresolvedEdit(item.id,{pieceNumber:e.target.value})} placeholder="piece #"/>
                      </div>
                      <div className="row3 mt1">
                        <input value={edit.value} onChange={e=>setUnresolvedEdit(item.id,{value:e.target.value})} placeholder="value"/>
                        <input value={edit.operatorUserId} onChange={e=>setUnresolvedEdit(item.id,{operatorUserId:e.target.value})} placeholder="operator user id"/>
                        <input value={edit.status} onChange={e=>setUnresolvedEdit(item.id,{status:e.target.value})} placeholder="complete/incomplete"/>
                      </div>
                      <div className="mt1" style={{display:"flex",gap:".45rem"}}>
                        <button className="btn btn-primary btn-sm" disabled={busyResolve} onClick={()=>resolveUnresolved(item)}>{busyResolve?"Resolving…":"Resolve"}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busyIgnore} onClick={()=>ignoreUnresolved(item)}>{busyIgnore?"Ignoring…":"Ignore"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminParts({ parts, toolLibrary, onCreatePart, onUpdatePart, onBulkUpdateParts, onCreateOp, onCreateDim, onUpdateDim, onRemoveDim, onDirtyChange }) {
  const [newPart,setNewPart]=useState({partNumber:"",description:"",revision:"A"});
  const [partErr,setPartErr]=useState("");
  const [apiErr,setApiErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [newOp,setNewOp]=useState({});
  const [partQuery,setPartQuery]=useState("");
  const [pageSize,setPageSize]=useState(25);
  const [page,setPage]=useState(1);
  const [bulkFind,setBulkFind]=useState("");
  const [bulkReplace,setBulkReplace]=useState("");
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkMsg,setBulkMsg]=useState("");
  useEffect(()=>{
    const hasNewPart=!!(newPart.partNumber||newPart.description);
    const hasNewOp=Object.values(newOp).some(v=>v?.opNum||v?.label);
    if(onDirtyChange) onDirtyChange(hasNewPart||hasNewOp);
  },[newPart,newOp,onDirtyChange]);
  const sortedPartEntries=Object.entries(parts||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  const query=partQuery.trim().toLowerCase();
  const filteredPartEntries=sortedPartEntries.filter(([pn,part])=>{
    if(!query) return true;
    const hay=[pn,part?.description||"",part?.currentRevision||""].join(" ").toLowerCase();
    return hay.includes(query);
  });
  const totalPages=Math.max(1, Math.ceil(filteredPartEntries.length / pageSize));
  const safePage=Math.min(page, totalPages);
  const visiblePartEntries=filteredPartEntries.slice((safePage-1)*pageSize, safePage*pageSize);
  useEffect(()=>{
    setPage(1);
  },[partQuery,pageSize]);
  useEffect(()=>{
    if(page>totalPages) setPage(totalPages);
  },[page,totalPages]);
  function revisionContext(pn){
    const part=parts[pn]||{};
    const current=part.currentRevision || "A";
    const next=part.nextRevision || nextRevisionCode(current);
    return { current, next };
  }
  function confirmRevisionCommit(pn, impact){
    const ctx=revisionContext(pn);
    const msg=[
      "Revision review required:",
      `Part ${pn}`,
      `Current revision: ${ctx.current}`,
      `Next revision: ${ctx.next}`,
      `Impact: ${impact}`,
      "",
      "Commit this setup change?"
    ].join("\n");
    return window.confirm(msg);
  }
  function describeDimImpact(field, dimName){
    const label=dimName || "dimension";
    if(field==="tools") return `Update allowed tools for ${label}`;
    if(field==="samplingInterval") return `Update custom sampling interval for ${label}`;
    return `Update ${field} for ${label}`;
  }
  async function handleAddPart(){
    const pn=newPart.partNumber.trim().toUpperCase();
    const revision=String(newPart.revision||"").trim().toUpperCase();
    if(!pn||!newPart.description.trim()||!/^[A-Z]+$/.test(revision)){setPartErr("Part number, part name, and revision are required.");return;}
    if(parts[pn]){setPartErr("Part number already exists.");return;}
    setPartErr("");setApiErr("");setSaving(true);
    try{
      await onCreatePart({partNumber:pn,description:newPart.description.trim(),revision});
      setNewPart({partNumber:"",description:"",revision:"A"});
    }catch(e){
      setApiErr(e?.message||"Unable to add part.");
    }finally{
      setSaving(false);
    }
  }
  function updateDescLocal(pn,v){ onUpdatePart(pn,v,false).catch(()=>{}); }
  function updateDescPersist(pn,v){
    const part=parts[pn]||{};
    const persistedName=part.revisions?.[0]?.partName || part.description || "";
    if(String(v).trim()===String(persistedName).trim()) return;
    if(!confirmRevisionCommit(pn, "Update part name")){
      onUpdatePart(pn,persistedName,false).catch(()=>{});
      return;
    }
    onUpdatePart(pn,v,true).catch(e=>setApiErr(e?.message||"Unable to update part."));
  }
  async function handleAddOp(pn){
    const o=newOp[pn]||{};
    const opKeyRaw=(o.opNum||"").trim();
    if(!opKeyRaw||!o.label?.trim())return;
    const opKey=normalizeOpNumber(opKeyRaw);
    if(!opKey){ setApiErr("Operation number must be between 001 and 999."); return; }
    if(parts[pn].operations[opKey]){ setApiErr(`Operation ${opKey} already exists.`); return; }
    if(!confirmRevisionCommit(pn, `Add operation ${opKey} — ${o.label.trim()}`)) return;
    setApiErr("");
    try{
      await onCreateOp(pn,opKey,o.label.trim());
      setNewOp(p=>({...p,[pn]:{opNum:"",label:""}}));
    }catch(e){
      setApiErr(e?.message||"Unable to add operation.");
    }
  }
  function updateDim(pn,opKey,dimId,field,value,persist,dimName){
    if(persist && !confirmRevisionCommit(pn, describeDimImpact(field, dimName))) return;
    onUpdateDim(pn,opKey,dimId,field,value,persist).catch(e=>setApiErr(e?.message||"Unable to update dimension."));
  }
  async function addDim(pn,opKey){
    if(!confirmRevisionCommit(pn, `Add dimension to operation ${opKey}`)) return;
    setApiErr("");
    try{
      await onCreateDim(pn,opKey,{name:"New Dimension",nominal:0.0000,tolPlus:0.0050,tolMinus:0.0050,unit:"in",sampling:"first_last",samplingInterval:null,inputMode:"single",tools:[]});
    }catch(e){
      setApiErr(e?.message||"Unable to add dimension.");
    }
  }
  async function removeDim(pn,opKey,dimId,dimName){
    if(!confirmRevisionCommit(pn, `Remove dimension ${dimName || dimId} from operation ${opKey}`)) return;
    setApiErr("");
    try{
      await onRemoveDim(pn,opKey,dimId);
    }catch(e){
      setApiErr(e?.message||"Unable to remove dimension.");
    }
  }
  async function handleBulkRename(){
    const find=bulkFind;
    if(!find.trim()){ setBulkMsg("Enter text to find."); return; }
    const esc=find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re=new RegExp(esc, "g");
    const updates=filteredPartEntries
      .map(([partNumber,part])=>{
        const nextName=String(part.description||"").replace(re, bulkReplace);
        if(nextName===part.description) return null;
        return { id: partNumber, description: nextName };
      })
      .filter(Boolean);
    if(updates.length===0){ setBulkMsg("No filtered parts matched the find text."); return; }
    if(!window.confirm(`Apply bulk rename to ${updates.length} part(s)?`)) return;

    setBulkMsg("");
    setBulkBusy(true);
    try{
      const result=await onBulkUpdateParts(updates);
      const updated=result?.updated ?? updates.length;
      const skipped=result?.skipped ?? 0;
      const missing=(result?.notFound || []).length;
      setBulkMsg(`Bulk update complete: ${updated} updated, ${skipped} skipped${missing ? `, ${missing} missing` : ""}.`);
    }catch(e){
      setBulkMsg(e?.message || "Bulk update failed.");
    }finally{
      setBulkBusy(false);
    }
  }
  return (
    <div>
      <div className="card">
        <div className="card-head"><div className="card-title">Add New Part</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field"><label>Part Number</label><input value={newPart.partNumber} onChange={e=>setNewPart(p=>({...p,partNumber:e.target.value.toUpperCase()}))} placeholder="e.g. 5678" style={{fontFamily:"var(--mono)"}}/></div>
            <div className="field"><label>Part Name</label><input value={newPart.description} onChange={e=>setNewPart(p=>({...p,description:e.target.value}))} placeholder="Part name"/></div>
            <div className="field"><label>Initial Revision</label><input value={newPart.revision} onChange={e=>setNewPart(p=>({...p,revision:e.target.value.toUpperCase().replace(/[^A-Z]/g,"")}))} placeholder="A" style={{fontFamily:"var(--mono)"}}/></div>
          </div>
          {partErr&&<p className="err-text mt1">{partErr}</p>}
          {apiErr&&<p className="err-text mt1">{apiErr}</p>}
          <div className="mt2"><button className="btn btn-primary" disabled={saving} onClick={handleAddPart}>{saving?"Saving…":"+ Add Part"}</button></div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Catalog Controls</div></div>
        <div className="card-body">
          <div className="row3">
            <div className="field">
              <label>Search Parts</label>
              <input value={partQuery} onChange={e=>setPartQuery(e.target.value)} placeholder="Filter by part number, name, or revision"/>
            </div>
            <div className="field">
              <label>Page Size</label>
              <select value={String(pageSize)} onChange={e=>setPageSize(Math.max(1, Number(e.target.value)||25))}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div className="field" style={{alignItems:"flex-end"}}>
              <div className="text-muted" style={{fontSize:".72rem"}}>
                Showing {visiblePartEntries.length} of {filteredPartEntries.length} filtered ({sortedPartEntries.length} total)
              </div>
            </div>
          </div>
          <div className="row3 mt1">
            <div className="field"><label>Bulk Find</label><input value={bulkFind} onChange={e=>setBulkFind(e.target.value)} placeholder="Find text in part names"/></div>
            <div className="field"><label>Bulk Replace</label><input value={bulkReplace} onChange={e=>setBulkReplace(e.target.value)} placeholder="Replacement text"/></div>
            <div className="field" style={{justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" disabled={bulkBusy} onClick={handleBulkRename}>{bulkBusy ? "Applying…" : "Apply to Filtered Parts"}</button>
            </div>
          </div>
          {bulkMsg && <p className="text-muted mt1" style={{fontSize:".74rem"}}>{bulkMsg}</p>}
          <div className="gap1 mt1" style={{justifyContent:"flex-end"}}>
            <button className="btn btn-ghost btn-sm" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
            <div className="text-muted" style={{fontSize:".72rem",padding:".35rem .4rem"}}>Page {safePage} / {totalPages}</div>
            <button className="btn btn-ghost btn-sm" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button>
          </div>
        </div>
      </div>
      {filteredPartEntries.length===0 && (
        <div className="card">
          <div className="card-body">
            <div className="text-muted">No parts match the current filter.</div>
          </div>
        </div>
      )}
      {visiblePartEntries.map(([pn,part])=>(
        <div className="card" key={pn}>
          <div className="card-head">
            <div style={{display:"flex",alignItems:"center",gap:"1rem",flex:1}}>
              <div className="card-title" style={{whiteSpace:"nowrap"}}>Part {pn}</div>
              <input value={part.description} onChange={e=>updateDescLocal(pn,e.target.value)}
                style={{background:"var(--panel2)",border:"1px solid var(--border2)",color:"var(--text)",fontFamily:"var(--sans)",fontSize:".85rem",padding:".3rem .6rem",borderRadius:"2px",outline:"none",flex:1,maxWidth:"400px",transition:"border-color .15s"}}
                onFocus={e=>e.target.style.borderColor="var(--accent)"}
                onBlur={e=>{updateDescPersist(pn,e.target.value);e.target.style.borderColor="var(--border2)";}}/>
              <div className="text-muted" style={{fontSize:".72rem",whiteSpace:"nowrap"}}>
                Rev {part.currentRevision||"A"} → {part.nextRevision||nextRevisionCode(part.currentRevision||"A")}
              </div>
            </div>
          </div>
          <div style={{padding:"1rem 1.25rem"}}>
            <div className="text-muted" style={{fontSize:".72rem",marginBottom:".6rem"}}>
              Setup changes require revision review before commit.
            </div>
            {Array.isArray(part.revisions) && part.revisions.length>0 && (
              <details style={{marginBottom:"1rem"}}>
                <summary style={{cursor:"pointer",fontSize:".74rem",color:"var(--muted)"}}>
                  Revision History ({part.revisions.length})
                </summary>
                <div style={{marginTop:".4rem",display:"grid",gap:".2rem"}}>
                  {part.revisions.slice(0,10).map((rev)=>(
                    <div key={rev.revision} className="text-muted" style={{fontSize:".72rem"}}>
                      Rev {rev.revision} · {rev.changeSummary || "Setup update"} · {fmtTs(rev.createdAt)}
                    </div>
                  ))}
                </div>
              </details>
            )}
            {Object.entries(part.operations).map(([opKey,op])=>(
              <div key={opKey} style={{marginBottom:"1.5rem"}}>
                <div className="section-label">Op {opKey} — {op.label}</div>
                <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:"3px",marginBottom:".6rem"}}>
                  <table className="edit-table">
                    <thead><tr>
                      <th style={{minWidth:"140px"}}>Dimension</th>
                      <th style={{width:"85px"}}>Nominal</th>
                      <th style={{width:"82px"}}>Tol +</th>
                      <th style={{width:"82px"}}>Tol −</th>
                      <th style={{width:"60px"}}>Unit</th>
                      <th style={{width:"180px"}}>Sampling</th>
                      <th style={{width:"120px"}}>Input Mode</th>
                      <th style={{minWidth:"220px"}}>Allowed Tools</th>
                      <th style={{width:"40px"}}></th>
                    </tr></thead>
                    <tbody>
                      {op.dimensions.length===0&&<tr><td colSpan={9} className="empty-state" style={{padding:"1rem",fontSize:".76rem"}}>No dimensions defined.</td></tr>}
                      {op.dimensions.map(d=>(
                        <tr key={d.id}>
                          <td><input value={d.name} onChange={e=>updateDim(pn,opKey,d.id,"name",e.target.value,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"name",e.target.value,true,d.name)}/></td>
                          <td><input type="number" step="0.0001" value={d.nominal} onChange={e=>updateDim(pn,opKey,d.id,"nominal",parseFloat(e.target.value)||0,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"nominal",parseFloat(e.target.value)||0,true,d.name)} style={{fontFamily:"var(--mono)"}}/></td>
                          <td><input type="number" step="0.0001" value={d.tolPlus} onChange={e=>updateDim(pn,opKey,d.id,"tolPlus",parseFloat(e.target.value)||0,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"tolPlus",parseFloat(e.target.value)||0,true,d.name)} style={{fontFamily:"var(--mono)"}}/></td>
                          <td><input type="number" step="0.0001" value={d.tolMinus} onChange={e=>updateDim(pn,opKey,d.id,"tolMinus",parseFloat(e.target.value)||0,false,d.name)} onBlur={e=>updateDim(pn,opKey,d.id,"tolMinus",parseFloat(e.target.value)||0,true,d.name)} style={{fontFamily:"var(--mono)"}}/></td>
                          <td><select value={d.unit} onChange={e=>updateDim(pn,opKey,d.id,"unit",e.target.value,true,d.name)}>
                            <option>in</option><option>mm</option><option>Ra</option><option>deg</option>
                          </select></td>
                          <td>
                            <select value={d.sampling} onChange={e=>updateDim(pn,opKey,d.id,"sampling",e.target.value,true,d.name)}>
                              {SAMPLING_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {d.sampling==="custom_interval" && (
                              <input type="number" min="1" step="1" value={d.samplingInterval || 2}
                                onChange={e=>updateDim(pn,opKey,d.id,"samplingInterval",Math.max(1, Number(e.target.value)||1),false,d.name)}
                                onBlur={e=>updateDim(pn,opKey,d.id,"samplingInterval",Math.max(1, Number(e.target.value)||1),true,d.name)}
                                style={{marginTop:".3rem",fontFamily:"var(--mono)"}}
                                placeholder="Interval (N)"
                              />
                            )}
                          </td>
                          <td><select value={d.inputMode||"single"} onChange={e=>updateDim(pn,opKey,d.id,"inputMode",e.target.value,true,d.name)}>
                            <option value="single">Single</option>
                            <option value="range">Min/Max Range</option>
                          </select></td>
                          <td>
                            <ToolSearchPopover toolLibrary={toolLibrary} selectedIds={d.tools}
                              onAdd={id=>updateDim(pn,opKey,d.id,"tools",[...d.tools,id],true,d.name)}
                              onRemove={id=>updateDim(pn,opKey,d.id,"tools",d.tools.filter(x=>x!==id),true,d.name)}/>
                          </td>
                          <td style={{textAlign:"center"}}><button className="btn btn-danger btn-sm" onClick={()=>removeDim(pn,opKey,d.id,d.name)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={()=>addDim(pn,opKey)}>+ Add Dimension</button>
              </div>
            ))}
            <div style={{borderTop:"1px solid var(--border)",paddingTop:"1rem",marginTop:".5rem"}}>
              <div className="section-label" style={{color:"var(--muted)"}}>Add Operation</div>
              <div className="row3" style={{gap:".75rem"}}>
                <div className="field"><label>Op Number</label><input value={newOp[pn]?.opNum||""} onChange={e=>setNewOp(p=>({...p,[pn]:{...p[pn],opNum:e.target.value}}))} placeholder="e.g. 040" style={{fontFamily:"var(--mono)"}}/></div>
                <div className="field"><label>Op Label</label><input value={newOp[pn]?.label||""} onChange={e=>setNewOp(p=>({...p,[pn]:{...p[pn],label:e.target.value}}))} placeholder="e.g. Final Inspection"/></div>
                <div className="field" style={{justifyContent:"flex-end"}}><button className="btn btn-ghost" onClick={()=>handleAddOp(pn)}>+ Add Operation</button></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminView({ parts, jobs, records, toolLibrary, toolLocations, users, usersById, currentCaps, roleCaps, currentRole, currentUserId, loadRecordDetail, onEditValue, onCreateJob, onCreatePart, onUpdatePart, onBulkUpdateParts, onCreateOp, onCreateDim, onUpdateDim, onRemoveDim, onCreateTool, onUpdateTool, onCreateToolLocation, onUpdateToolLocation, onRemoveToolLocation, onCreateUser, onUpdateUser, onRemoveUser, onUpdateRoleCaps, onUnlockJob, onRefreshData }) {
  const [tab,setTab]=useState("jobs");
  const [dirtyByTab,setDirtyByTab]=useState({});
  const hasCap = cap => (currentCaps || []).includes(cap);
  const canEdit=hasCap("edit_records");
  const canManageParts=hasCap("manage_parts");
  const canManageTools=hasCap("manage_tools");
  const canManageUsers=hasCap("manage_users");
  const canManageRoles=hasCap("manage_roles");
  const canViewJobs=hasCap("view_jobs") || hasCap("manage_jobs");
  const canViewRecords=hasCap("view_records");
  const canManageJobs=hasCap("manage_jobs");
  const canViewAdmin=hasCap("view_admin");
  const canViewIssueReports=hasCap("view_admin");
  const canViewImports=canManageParts || canManageTools || canManageJobs;
  useEffect(()=>{
    if(!canViewAdmin) setTab("jobs");
    if(!canManageUsers && tab==="users") setTab("jobs");
    if(!canManageParts && tab==="parts") setTab("jobs");
    if(!canManageTools && tab==="tools") setTab("jobs");
    if(!canManageRoles && tab==="roles") setTab("jobs");
    if(!canViewIssueReports && tab==="issues") setTab("jobs");
    if(!canViewImports && tab==="imports") setTab("jobs");
  },[canViewAdmin,canManageUsers,canManageParts,canManageTools,canManageRoles,canViewIssueReports,canViewImports,tab]);
  useEffect(()=>{
    const dirty=!!dirtyByTab[tab];
    const handler=e=>{
      if(!dirty) return;
      e.preventDefault();
      e.returnValue="";
    };
    window.addEventListener("beforeunload",handler);
    return ()=>window.removeEventListener("beforeunload",handler);
  },[dirtyByTab,tab]);
  function setTabSafe(next){
    if(next===tab) return;
    if(dirtyByTab[tab] && !window.confirm("You have unsaved changes. Leave this page without saving?")) return;
    setTab(next);
  }
  return (
    <div>
      <div className="sub-tabs">
        {canViewJobs && <button className={`sub-tab ${tab==="jobs"?"active":""}`} onClick={()=>setTabSafe("jobs")}>Job Management</button>}
        {canViewRecords && <button className={`sub-tab ${tab==="records"?"active":""}`} onClick={()=>setTabSafe("records")}>Inspection Records</button>}
        {canViewIssueReports && <button className={`sub-tab ${tab==="issues"?"active":""}`} onClick={()=>setTabSafe("issues")}>Issue Reports</button>}
        {canViewImports && <button className={`sub-tab ${tab==="imports"?"active":""}`} onClick={()=>setTabSafe("imports")}>Data Imports</button>}
        {canManageParts && <button className={`sub-tab ${tab==="parts"?"active":""}`} onClick={()=>setTabSafe("parts")}>Part / Op Setup</button>}
        {canManageTools && <button className={`sub-tab ${tab==="tools"?"active":""}`} onClick={()=>setTabSafe("tools")}>Tool Library</button>}
        {canManageUsers && <button className={`sub-tab ${tab==="users"?"active":""}`} onClick={()=>setTabSafe("users")}>Users</button>}
        {canManageRoles && <button className={`sub-tab ${tab==="roles"?"active":""}`} onClick={()=>setTabSafe("roles")}>Roles</button>}
      </div>
      {tab==="jobs"&&canViewJobs&&<AdminJobs parts={parts} jobs={jobs} usersById={usersById} onCreateJob={onCreateJob} canManageJobs={canManageJobs} onUnlockJob={onUnlockJob}/>}
      {tab==="records"&&canViewRecords&&<AdminRecords records={records} parts={parts} toolLibrary={toolLibrary} usersById={usersById} loadRecordDetail={loadRecordDetail} canEdit={canEdit} onEditValue={onEditValue}/>}
      {tab==="issues"&&canViewIssueReports&&<AdminIssueReports currentRole={currentRole} currentUserId={currentUserId}/>}
      {tab==="imports"&&canViewImports&&<AdminImports currentRole={currentRole} canManageTools={canManageTools} canManageParts={canManageParts} canManageJobs={canManageJobs} onRefreshData={onRefreshData}/>}
      {tab==="parts"&&canManageParts&&<AdminParts parts={parts} toolLibrary={toolLibrary} onCreatePart={onCreatePart} onUpdatePart={onUpdatePart} onBulkUpdateParts={onBulkUpdateParts} onCreateOp={onCreateOp} onCreateDim={onCreateDim} onUpdateDim={onUpdateDim} onRemoveDim={onRemoveDim} onDirtyChange={dirty=>setDirtyByTab(p=>({...p,parts:dirty}))}/>}
      {tab==="tools"&&canManageTools&&<AdminTools toolLibrary={toolLibrary} toolLocations={toolLocations} onCreateTool={onCreateTool} onUpdateTool={onUpdateTool} onCreateToolLocation={onCreateToolLocation} onUpdateToolLocation={onUpdateToolLocation} onRemoveToolLocation={onRemoveToolLocation}/>}
      {tab==="users"&&canManageUsers&&<AdminUsers users={users} roleCaps={roleCaps} onCreateUser={onCreateUser} onUpdateUser={onUpdateUser} onRemoveUser={onRemoveUser} onDirtyChange={dirty=>setDirtyByTab(p=>({...p,users:dirty}))}/>}
      {tab==="roles"&&canManageRoles&&<AdminRoles roleCaps={roleCaps} onUpdateRoleCaps={onUpdateRoleCaps} onDirtyChange={dirty=>setDirtyByTab(p=>({...p,roles:dirty}))}/>}
    </div>
  );
}

function TransitionBanner({ state }) {
  if(!state || state.status==="idle") return null;
  const toneClass=state.status==="loading" ? "transition-loading" : state.status==="success" ? "transition-success" : "transition-error";
  const label=state.status==="loading" ? "Working" : state.status==="success" ? "Done" : "Error";
  const role=state.status==="error" ? "alert" : "status";
  const live=state.status==="error" ? "assertive" : "polite";
  return (
    <div className={`transition-banner ${toneClass}`} role={role} aria-live={live} data-testid="transition-banner">
      <span className="transition-label">{label}</span>
      <span>{state.message}</span>
    </div>
  );
}

export default function App({ authUser = null, onLogout = null }) {
  const [view,setView]=useState("operator");
  const [users,setUsers]=useState([]);
  const [usersById,setUsersById]=useState({});
  const [currentUserId,setCurrentUserId]=useState(authUser?.id ? String(authUser.id) : "");
  const [currentRole,setCurrentRole]=useState(authUser?.role || "Operator");
  const [userLoadErr,setUserLoadErr]=useState("");
  const [dataStatus,setDataStatus]=useState("local");
  const [dataErr,setDataErr]=useState("");
  const [parts,setParts]=useState(INITIAL_PARTS);
  const [jobs,setJobs]=useState(INITIAL_JOBS);
  const [records,setRecords]=useState(INITIAL_RECORDS);
  const [toolLibrary,setToolLibrary]=useState(INITIAL_TOOLS);
  const [toolLocations,setToolLocations]=useState([]);
  const [opIdToNumber,setOpIdToNumber]=useState({});
  const [roleCaps,setRoleCaps]=useState(DEFAULT_ROLE_CAPS);
  const prevUserRef=useRef("");
  const transitionTimeoutRef=useRef(null);
  const [transitionState,setTransitionState]=useState({ status:"idle", message:"" });

  function setTransition(status, message, resetMs){
    if(transitionTimeoutRef.current){
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current=null;
    }
    setTransitionState({ status, message });
    if(resetMs){
      transitionTimeoutRef.current=setTimeout(()=>{
        setTransitionState({ status:"idle", message:"" });
        transitionTimeoutRef.current=null;
      }, resetMs);
    }
  }

  async function runTransition(actionLabel, fn){
    setTransition("loading", `${actionLabel}…`);
    try{
      const result=await fn();
      setTransition("success", `${actionLabel} complete.`, 3500);
      return result;
    }catch(err){
      const detail=err?.message ? ` ${err.message}` : "";
      setTransition("error", `${actionLabel} failed.${detail}`, 7000);
      throw err;
    }
  }

  useEffect(()=>()=>{ if(transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current); },[]);

  useEffect(()=>{
    let active=true;
    api.users.list(currentRole || "Operator")
      .then(rows=>{
        if(!active)return;
        const localUsers = Array.isArray(rows) && rows.length ? rows : INITIAL_USERS;
        setUsers(localUsers);
        if(authUser?.id){
          setCurrentUserId(String(authUser.id));
          setCurrentRole(authUser.role || "Operator");
        }else if(!currentUserId && localUsers.length){
          setCurrentUserId(String(localUsers[0].id));
          setCurrentRole(localUsers[0].role);
        }
        if(!Array.isArray(rows) || rows.length===0){
          setUserLoadErr("Live user list unavailable - using local demo users.");
        }
      })
      .catch(()=>{
        if(!active)return;
        setUsers(INITIAL_USERS);
        if(authUser?.id){
          setCurrentUserId(String(authUser.id));
          setCurrentRole(authUser.role || "Operator");
        }else if(!currentUserId && INITIAL_USERS.length){
          setCurrentUserId(String(INITIAL_USERS[0].id));
          setCurrentRole(INITIAL_USERS[0].role);
        }
        setUserLoadErr("Live user list unavailable - using local demo users.");
      });
    return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    let active=true;
    async function loadRoleCaps(){
      if(dataStatus!=="live"){ setRoleCaps(DEFAULT_ROLE_CAPS); return; }
      if(currentRole!=="Admin"){ return; }
      try{
        const rows = await api.roles.list(currentRole);
        if(!active) return;
        const map={...DEFAULT_ROLE_CAPS};
        for(const r of rows||[]){
          map[r.role]=r.capabilities||[];
        }
        setRoleCaps(map);
      }catch{
        if(!active) return;
        setRoleCaps(DEFAULT_ROLE_CAPS);
      }
    }
    loadRoleCaps();
    return ()=>{active=false;};
  },[currentRole,dataStatus]);

  useEffect(()=>{
    const map={};
    users.forEach(u=>{ map[String(u.id)] = u.name; });
    setUsersById(map);
  },[users]);

  useEffect(()=>{
    if(authUser?.id){
      const authId=String(authUser.id);
      if(currentUserId!==authId) setCurrentUserId(authId);
      if((authUser.role||"Operator")!==currentRole) setCurrentRole(authUser.role||"Operator");
      return;
    }
    const u=users.find(u=>String(u.id)===String(currentUserId));
    if(u&&u.role!==currentRole) setCurrentRole(u.role);
  },[authUser,currentRole,currentUserId,users]);

  useEffect(()=>{
    if(dataStatus!=="live"){ prevUserRef.current=currentUserId; return; }
    const prev=prevUserRef.current;
    const next=currentUserId;
    if(prev && prev!==next){
      api.sessions.end(Number(prev), currentRole).catch(()=>{});
    }
    if(next && next!==prev){
      api.sessions.start(Number(next), currentRole).catch(()=>{});
    }
    prevUserRef.current=next;
  },[currentUserId,dataStatus,currentRole]);

  useEffect(()=>{
    let active=true;
    async function loadData(){
      setDataStatus("loading");
      setDataErr("");
      try{
        const role=currentRole||"Admin";
        const [toolsList, toolLocationsList, partsList] = await Promise.all([
          api.tools.list(role),
          api.toolLocations.list(role),
          api.parts.list(role)
        ]);
        const partDetails = await Promise.all((partsList||[]).map(p=>api.parts.get(p.id, role)));
        const { partsObj, opIdToNumber: opMap } = buildPartsFromApi(partDetails);
        const [jobsList, recordsList] = await Promise.all([
          api.jobs.list({}, role),
          api.records.list({}, role)
        ]);
        if(!active) return;
        setToolLibrary(mapToolLibrary(toolsList));
        setToolLocations(mapToolLocations(toolLocationsList));
        setParts(partsObj);
        setOpIdToNumber(opMap);
        setJobs(mapJobsFromApi(jobsList, opMap));
        setRecords(mapRecordsFromApi(recordsList, opMap, usersById));
        setDataStatus("live");
      }catch(err){
        if(!active) return;
        setDataStatus("fallback");
        setDataErr(err?.message || "API unavailable.");
      }
    }
    loadData();
    return ()=>{active=false;};
  },[]);

  async function reloadLiveData(){
    setDataStatus("loading");
    setDataErr("");
    try{
      const role=currentRole || "Admin";
      const [toolsList, toolLocationsList, partsList] = await Promise.all([
        api.tools.list(role),
        api.toolLocations.list(role),
        api.parts.list(role)
      ]);
      const partDetails = await Promise.all((partsList||[]).map(p=>api.parts.get(p.id, role)));
      const { partsObj, opIdToNumber: opMap } = buildPartsFromApi(partDetails);
      const [jobsList, recordsList] = await Promise.all([
        api.jobs.list({}, role),
        api.records.list({}, role)
      ]);
      setToolLibrary(mapToolLibrary(toolsList));
      setToolLocations(mapToolLocations(toolLocationsList));
      setParts(partsObj);
      setOpIdToNumber(opMap);
      setJobs(mapJobsFromApi(jobsList, opMap));
      setRecords(mapRecordsFromApi(recordsList, opMap, usersById));
      setDataStatus("live");
    }catch(err){
      setDataStatus("fallback");
      setDataErr(err?.message || "API unavailable.");
    }
  }

  const currentCaps=roleCaps[currentRole] || [];
  const hasCap = cap => currentCaps.includes(cap);
  const canViewAdmin = hasCap("view_admin");
  const canViewOperator = hasCap("view_operator") || currentRole==="Operator";
  const canViewRecords = hasCap("view_records");
  const canEditRecords = hasCap("edit_records");
  const canManageJobs = hasCap("manage_jobs");
  const canManageParts = hasCap("manage_parts");
  const canManageTools = hasCap("manage_tools");
  const canManageUsers = hasCap("manage_users");
  const canManageRoles = hasCap("manage_roles");

  useEffect(()=>{
    if(view==="admin" && !canViewAdmin) setView(canViewOperator?"operator":"records");
    if(view==="operator" && !canViewOperator) setView(canViewAdmin?"admin":"records");
    if(view==="records" && !canViewRecords) setView(canViewOperator?"operator":"admin");
  },[currentRole,view,canViewAdmin,canViewOperator,canViewRecords]);
  async function handleSubmit(record,jobNumber){
    if(dataStatus!=="live"){
      const nextStatus=record.status==="complete"?"closed":"incomplete";
      setRecords(prev=>[record,...prev]);
      setJobs(prev=>({...prev,[jobNumber]:{...prev[jobNumber],status:nextStatus}}));
      return;
    }
    if(!currentUserId) throw new Error("Select a current user before submitting.");
    const job=jobs[jobNumber];
    const opId=job?.operationId || parts?.[record.partNumber]?.operations?.[record.operation]?.id;
    if(!opId) throw new Error("Operation mapping missing for this job.");
    const op=parts?.[record.partNumber]?.operations?.[record.operation];
    const dimMap=new Map((op?.dimensions||[]).map(d=>[String(d.id),d]));
    const missingPiecesPayload=Object.entries(record.missingPieces||{}).map(([piece,info])=>({
      pieceNumber:Number(piece),
      reason:info.reason,
      ncNum:info.ncNum||undefined,
      details:info.details||undefined
    }));
    const missingSet=new Set(Object.keys(record.missingPieces||{}).map(p=>Number(p)));
    const valuesPayload=[];
    for(const [key,val] of Object.entries(record.values||{})){
      if(val===undefined||val==="") continue;
      const [dimId,pieceStr]=key.split("_");
      const pieceNumber=Number(pieceStr);
      if(missingSet.has(pieceNumber)) continue;
      const dim=dimMap.get(String(dimId));
      let isOot=false;
      if(val==="FAIL") isOot=true;
      else if(val==="PASS") isOot=false;
      else {
        const st=dim?isOOT(val,dim.tolPlus,dim.tolMinus,dim.nominal):null;
        isOot=st===true;
      }
      valuesPayload.push({
        dimensionId:Number(dimId),
        pieceNumber,
        value:val,
        isOot
      });
    }
    const toolsPayload=Object.entries(record.tools||{}).flatMap(([dimId,rows])=>{
      const list=Array.isArray(rows) ? rows : (rows ? [rows] : []);
      return list.flatMap(t=>{
        if(!t?.toolId || !t?.itNum) return [];
        return [{
          dimensionId:Number(dimId),
          toolId:Number(t.toolId),
          itNum:String(t.itNum)
        }];
      });
    });
    const payload={
      jobId:jobNumber,
      partId:record.partNumber,
      operationId:Number(opId),
      lot:record.lot,
      qty:record.qty,
      operatorUserId:Number(currentUserId),
      status:record.status,
      oot:record.oot,
      comment:record.comment||"",
      values:valuesPayload,
      tools:toolsPayload,
      missingPieces:missingPiecesPayload
    };
    const created=await api.records.submit(payload, currentRole||"Operator");
    const mapped=mapRecordsFromApi([created], opIdToNumber, usersById)[0];
    setRecords(prev=>[mapped,...prev]);
    const nextStatus=record.status==="complete"?"closed":"incomplete";
    setJobs(prev=>({...prev,[jobNumber]:{...prev[jobNumber],status:nextStatus,draftData:undefined}}));
  }
  function handleDraft({jobNumber,draftData}){setJobs(prev=>({...prev,[jobNumber]:{...prev[jobNumber],status:"draft",draftData}}));}
  async function handleCreateJob(job){
    if(dataStatus!=="live"){
      setJobs(prev=>({...prev,[job.jobNumber]:job}));
      return;
    }
    return runTransition("Create job", async ()=>{
      if(!canManageJobs) throw new Error("Permission required to create jobs.");
      const opId=parts?.[job.partNumber]?.operations?.[job.operation]?.id;
      if(!opId) throw new Error("Operation mapping missing for this job.");
      const created=await api.jobs.create({
        id:job.jobNumber,
        partId:job.partNumber,
        partRevision:job.partRevision,
        operationId:Number(opId),
        lot:job.lot,
        qty:job.qty,
        status:job.status || "open"
      }, currentRole);
      const mapped=mapJobsFromApi([created], opIdToNumber)[0];
      setJobs(prev=>({...prev,[mapped.jobNumber]:mapped}));
    });
  }
  async function handleCreatePart(part){
    const pn=part.partNumber;
    const normalizedRevision=String(part.revision || "A").trim().toUpperCase();
    if(dataStatus!=="live"){
      setParts(prev=>({...prev,[pn]:{
        partNumber:pn,
        description:part.description,
        currentRevision:normalizedRevision,
        nextRevision:nextRevisionCode(normalizedRevision),
        revisions:[{ revision:normalizedRevision, partName:part.description, changeSummary:"Initial setup" }],
        readOnlyRevision:false,
        operations:{}
      }}));
      return;
    }
    return runTransition("Create part", async ()=>{
      if(!canManageParts) throw new Error("Permission required to add parts.");
      const created=await api.parts.create({id:pn,description:part.description,revision:normalizedRevision}, currentRole);
      const createdDesc=created?.description || part.description;
      const createdRev=created?.currentRevision || normalizedRevision;
      setParts(prev=>({...prev,[pn]:{
        partNumber:pn,
        description:createdDesc,
        currentRevision:createdRev,
        nextRevision:created?.nextRevision || nextRevisionCode(createdRev),
        revisions:[{
          revision:createdRev,
          revisionIndex:revisionCodeToIndex(createdRev) || 1,
          partName:createdDesc,
          changeSummary:"Initial part setup",
          changedFields:["part.description"],
          createdByRole:currentRole
        }],
        readOnlyRevision:false,
        operations:{}
      }}));
    });
  }
  async function handleUpdatePart(partNumber, description, persist){
    setParts(prev=>({...prev,[partNumber]:{...prev[partNumber],description}}));
    if(!persist) return;
    if(dataStatus!=="live") return;
    return runTransition("Update part", async ()=>{
      if(!canManageParts) throw new Error("Permission required to update parts.");
      await api.parts.update(partNumber, {description}, currentRole);
      await reloadLiveData();
    });
  }
  async function handleBulkUpdateParts(updates){
    if(!Array.isArray(updates) || updates.length===0) return { ok:true, updated:0, skipped:0, notFound:[] };
    if(dataStatus!=="live"){
      setParts(prev=>{
        const next={...prev};
        for(const u of updates){
          const id=String(u?.id||"").trim();
          const description=String(u?.description||"").trim();
          if(!id || !description || !next[id]) continue;
          next[id]={...next[id],description};
        }
        return next;
      });
      return { ok:true, updated:updates.length, skipped:0, notFound:[] };
    }
    return runTransition("Bulk update parts", async ()=>{
      if(!canManageParts) throw new Error("Permission required to update parts.");
      const result=await api.parts.bulkUpdate({ updates }, currentRole);
      await reloadLiveData();
      return result;
    });
  }
  async function handleCreateOp(partNumber, opNumber, label){
    const normalizedOp=normalizeOpNumber(opNumber);
    if(!normalizedOp) throw new Error("Operation number must be between 001 and 999.");
    if(dataStatus!=="live"){
      setParts(prev=>({
        ...prev,
        [partNumber]:{
          ...prev[partNumber],
          operations:{
            ...prev[partNumber].operations,
            [normalizedOp]:{ id:`op_${uid()}`, label, dimensions:[] }
          }
        }
      }));
      return;
    }
    return runTransition("Create operation", async ()=>{
      if(!canManageParts) throw new Error("Permission required to add operations.");
      await api.operations.create({partId:partNumber,opNumber:normalizedOp,label}, currentRole);
      await reloadLiveData();
    });
  }
  async function handleCreateDim(partNumber, opNumber, dim){
    const op=parts?.[partNumber]?.operations?.[opNumber];
    if(!op) throw new Error("Operation not found.");
    if(dataStatus!=="live"){
      const newDim={id:`d${uid()}`,...dim};
      setParts(prev=>({
        ...prev,
        [partNumber]:{
          ...prev[partNumber],
          operations:{
            ...prev[partNumber].operations,
            [opNumber]:{...prev[partNumber].operations[opNumber],dimensions:[...prev[partNumber].operations[opNumber].dimensions,newDim]}
          }
        }
      }));
      return;
    }
    return runTransition("Create dimension", async ()=>{
      if(!canManageParts) throw new Error("Permission required to add dimensions.");
      await api.dimensions.create({
        operationId:Number(op.id),
        name:dim.name,
        nominal:dim.nominal,
        tolPlus:dim.tolPlus,
        tolMinus:dim.tolMinus,
        unit:dim.unit,
        sampling:dim.sampling,
        samplingInterval:dim.sampling==="custom_interval" ? (Number(dim.samplingInterval)||2) : null,
        inputMode:dim.inputMode || "single",
        toolIds:dim.tools
      }, currentRole);
      await reloadLiveData();
    });
  }
  async function handleUpdateDim(partNumber, opNumber, dimId, field, value, persist){
    const op=parts?.[partNumber]?.operations?.[opNumber];
    if(!op) return;
    const dims=op.dimensions.map(d=>{
      if(d.id!==dimId) return d;
      const next={...d,[field]:value};
      if(field==="sampling"){
        if(value==="custom_interval"){
          next.samplingInterval = d.samplingInterval || 2;
        }else{
          next.samplingInterval = null;
        }
      }
      if(field==="samplingInterval"){
        const n=Math.max(1, Number(value)||1);
        next.samplingInterval=n;
      }
      return next;
    });
    setParts(prev=>({
      ...prev,
      [partNumber]:{
        ...prev[partNumber],
        operations:{
          ...prev[partNumber].operations,
          [opNumber]:{...prev[partNumber].operations[opNumber],dimensions:dims}
        }
      }
    }));
    if(!persist) return;
    if(dataStatus!=="live") return;
    return runTransition("Update dimension", async ()=>{
      if(!canManageParts) throw new Error("Permission required to update dimensions.");
      const dim=dims.find(d=>d.id===dimId);
      if(!dim) return;
      await api.dimensions.update(dimId, {
        name:dim.name,
        nominal:dim.nominal,
        tolPlus:dim.tolPlus,
        tolMinus:dim.tolMinus,
        unit:dim.unit,
        sampling:dim.sampling,
        samplingInterval:dim.sampling==="custom_interval" ? (Number(dim.samplingInterval)||2) : null,
        inputMode:dim.inputMode || "single",
        toolIds:dim.tools
      }, currentRole);
      await reloadLiveData();
    });
  }
  async function handleRemoveDim(partNumber, opNumber, dimId){
    if(dataStatus!=="live"){
      setParts(prev=>({
        ...prev,
        [partNumber]:{
          ...prev[partNumber],
          operations:{
            ...prev[partNumber].operations,
            [opNumber]:{...prev[partNumber].operations[opNumber],dimensions:prev[partNumber].operations[opNumber].dimensions.filter(d=>d.id!==dimId)}
          }
        }
      }));
      return;
    }
    return runTransition("Remove dimension", async ()=>{
      if(!canManageParts) throw new Error("Permission required to remove dimensions.");
      await api.dimensions.remove(dimId, currentRole);
      await reloadLiveData();
    });
  }
  async function handleCreateUser(user){
    if(dataStatus!=="live"){
      const id=`u_${uid()}`;
      setUsers(prev=>[...prev,{id,name:user.name,role:user.role,active:user.active}].sort((a,b)=>a.name.localeCompare(b.name)));
      return;
    }
    return runTransition("Create user", async ()=>{
      if(!canManageUsers) throw new Error("Permission required to add users.");
      const created=await api.users.create({name:user.name,role:user.role,active:user.active}, currentRole);
      setUsers(prev=>[...prev,created].sort((a,b)=>a.name.localeCompare(b.name)));
    });
  }
  async function handleUpdateUser(id, payload){
    if(dataStatus!=="live"){
      setUsers(prev=>prev.map(u=>String(u.id)===String(id)?{...u,...payload}:u).sort((a,b)=>a.name.localeCompare(b.name)));
      return;
    }
    return runTransition("Update user", async ()=>{
      if(!canManageUsers) throw new Error("Permission required to update users.");
      const updated=await api.users.update(id, payload, currentRole);
      setUsers(prev=>prev.map(u=>String(u.id)===String(id)?updated:u).sort((a,b)=>a.name.localeCompare(b.name)));
    });
  }
  async function handleRemoveUser(id){
    if(dataStatus!=="live"){
      setUsers(prev=>prev.filter(u=>String(u.id)!==String(id)));
      return;
    }
    return runTransition("Remove user", async ()=>{
      if(!canManageUsers) throw new Error("Permission required to remove users.");
      await api.users.remove(id, currentRole);
      setUsers(prev=>prev.filter(u=>String(u.id)!==String(id)));
    });
  }
  async function handleCreateTool(tool){
    if(dataStatus!=="live"){
      const id="t"+uid();
      setToolLibrary(prev=>({...prev,[id]:{
        id,
        name:tool.name,
        type:tool.type,
        itNum:tool.itNum,
        size:tool.size||"",
        calibrationDueDate:tool.calibrationDueDate || "",
        currentLocationId:tool.currentLocationId || null,
        homeLocationId:tool.homeLocationId || null,
        active:tool.active!==false,
        visible:tool.visible!==false
      }}));
      return;
    }
    return runTransition("Create tool", async ()=>{
      if(!canManageTools) throw new Error("Permission required to add tools.");
      const created=await api.tools.create({
        name:tool.name,
        type:tool.type,
        itNum:tool.itNum,
        size:tool.size,
        calibrationDueDate:tool.calibrationDueDate || null,
        currentLocationId:tool.currentLocationId || null,
        homeLocationId:tool.homeLocationId || null,
        active:tool.active!==false,
        visible:tool.visible!==false
      }, currentRole);
      const id=String(created.id);
      setToolLibrary(prev=>({...prev,[id]:{
        id,
        name:created.name,
        type:created.type,
        itNum:created.it_num ?? created.itNum,
        size:created.size ?? "",
        calibrationDueDate:created.calibration_due_date ?? created.calibrationDueDate ?? "",
        currentLocationId:created.current_location_id ?? created.currentLocationId ?? null,
        currentLocationName:created.current_location_name ?? created.currentLocationName ?? "",
        currentLocationType:created.current_location_type ?? created.currentLocationType ?? "",
        homeLocationId:created.home_location_id ?? created.homeLocationId ?? null,
        homeLocationName:created.home_location_name ?? created.homeLocationName ?? "",
        homeLocationType:created.home_location_type ?? created.homeLocationType ?? "",
        active:created.active ?? true,
        visible:created.visible ?? true
      }}));
    });
  }
  async function handleUpdateTool(id, patch){
    if(dataStatus!=="live"){
      setToolLibrary(prev=>({
        ...prev,
        [id]:{...prev[id],...patch}
      }));
      return;
    }
    return runTransition("Update tool", async ()=>{
      if(!canManageTools) throw new Error("Permission required to update tools.");
      const updated=await api.tools.update(id, patch, currentRole);
      setToolLibrary(prev=>({
        ...prev,
        [String(updated.id)]:{
          id:String(updated.id),
          name:updated.name,
          type:updated.type,
          itNum:updated.it_num ?? updated.itNum,
          size:updated.size ?? "",
          calibrationDueDate:updated.calibration_due_date ?? updated.calibrationDueDate ?? "",
          currentLocationId:updated.current_location_id ?? updated.currentLocationId ?? null,
          currentLocationName:updated.current_location_name ?? updated.currentLocationName ?? "",
          currentLocationType:updated.current_location_type ?? updated.currentLocationType ?? "",
          homeLocationId:updated.home_location_id ?? updated.homeLocationId ?? null,
          homeLocationName:updated.home_location_name ?? updated.homeLocationName ?? "",
          homeLocationType:updated.home_location_type ?? updated.homeLocationType ?? "",
          active:updated.active ?? true,
          visible:updated.visible ?? true
        }
      }));
    });
  }
  async function handleCreateToolLocation(location){
    if(dataStatus!=="live"){
      const id=Date.now();
      setToolLocations(prev=>[...prev,{ id, name:location.name, locationType:location.locationType }].sort((a,b)=>a.name.localeCompare(b.name)));
      return;
    }
    return runTransition("Create tool location", async ()=>{
      if(!canManageTools) throw new Error("Permission required to manage tool locations.");
      const created=await api.toolLocations.create(location, currentRole);
      setToolLocations(prev=>[...prev,{ id:Number(created.id), name:created.name, locationType:created.location_type ?? created.locationType }].sort((a,b)=>a.name.localeCompare(b.name)));
    });
  }
  async function handleUpdateToolLocation(id, patch){
    if(dataStatus!=="live"){
      setToolLocations(prev=>prev.map(loc=>String(loc.id)===String(id)?{...loc,...patch}:loc).sort((a,b)=>a.name.localeCompare(b.name)));
      return;
    }
    return runTransition("Update tool location", async ()=>{
      if(!canManageTools) throw new Error("Permission required to manage tool locations.");
      const updated=await api.toolLocations.update(id, patch, currentRole);
      setToolLocations(prev=>prev.map(loc=>String(loc.id)===String(id)?{
        id:Number(updated.id),
        name:updated.name,
        locationType:updated.location_type ?? updated.locationType
      }:loc).sort((a,b)=>a.name.localeCompare(b.name)));
    });
  }
  async function handleRemoveToolLocation(id){
    if(dataStatus!=="live"){
      setToolLocations(prev=>prev.filter(loc=>String(loc.id)!==String(id)));
      setToolLibrary(prev=>{
        const next={...prev};
        Object.keys(next).forEach((toolId)=>{
          const tool=next[toolId];
          if(String(tool.currentLocationId)===String(id) || String(tool.homeLocationId)===String(id)){
            next[toolId]={...tool,currentLocationId:null,currentLocationName:"",homeLocationId:null,homeLocationName:""};
          }
        });
        return next;
      });
      return;
    }
    return runTransition("Remove tool location", async ()=>{
      if(!canManageTools) throw new Error("Permission required to manage tool locations.");
      await api.toolLocations.remove(id, currentRole);
      setToolLocations(prev=>prev.filter(loc=>String(loc.id)!==String(id)));
      await reloadLiveData();
    });
  }
  async function handleUpdateRoleCaps(role, capabilities){
    if(dataStatus!=="live"){
      setRoleCaps(prev=>({...prev,[role]:capabilities}));
      return;
    }
    return runTransition("Update role capabilities", async ()=>{
      if(!canManageRoles) throw new Error("Permission required to manage roles.");
      const updated=await api.roles.update(role, { capabilities }, currentRole);
      setRoleCaps(prev=>({...prev,[role]:updated.capabilities || []}));
    });
  }
  async function handleEditRecordValue({ recordId, dimensionId, pieceNumber, value, reason }){
    if(dataStatus!=="live") throw new Error("Edits require live data mode.");
    return runTransition("Update inspection record", async ()=>{
      if(!currentUserId) throw new Error("Select a current user before editing.");
      if(!canEditRecords) throw new Error("Permission required for edits.");
      await api.records.editValue(recordId, {
        userId: Number(currentUserId),
        dimensionId: Number(dimensionId),
        pieceNumber: Number(pieceNumber),
        value: String(value),
        reason
      }, currentRole);
      const detail=await api.records.get(recordId, currentRole);
      const mapped=mapRecordDetailFromApi(detail, opIdToNumber, usersById);
      setRecords(prev=>prev.map(r=>String(r.id)===String(recordId)?{...r,oot:mapped.oot}:r));
      return mapped;
    });
  }
  async function handleLockJob(jobId){
    if(dataStatus!=="live") return;
    if(!currentUserId) throw new Error("Select a current user before locking a job.");
    try{
      await api.jobs.lock(jobId, currentUserId, currentRole||"Operator");
      setJobs(prev=>({...prev,[jobId]:{...prev[jobId],lockOwnerUserId:Number(currentUserId),lockTimestamp:new Date().toISOString()}}));
    }catch(err){
      if(err?.message==="locked") throw new Error("Job is locked by another user.");
      if(err?.message==="job_not_open") throw new Error("Job is not open.");
      throw err;
    }
  }
  async function handleUnlockJob(jobId){
    if(dataStatus!=="live") return;
    return runTransition("Unlock job", async ()=>{
      await api.jobs.unlock(jobId, Number(currentUserId) || undefined, currentRole||"Operator");
      setJobs(prev=>({...prev,[jobId]:{...prev[jobId],lockOwnerUserId:null,lockTimestamp:null}}));
    });
  }
  async function loadRecordDetail(id){
    const role=currentRole||"Admin";
    const detail=await api.records.get(id, role);
    return mapRecordDetailFromApi(detail, opIdToNumber, usersById);
  }
  const dataChipLabel = dataStatus==="live" ? "Live Data" : dataStatus==="loading" ? "Loading" : "Local Demo";
  const dataChipClass = dataStatus==="live" ? "data-live" : dataStatus==="loading" ? "data-loading" : "data-fallback";
  return (
    <ErrorBoundary>
      <>
        <style>{CSS}</style>
        <div className="app-header">
          <div className="logo"><div className="logo-icon"/>InspectFlow</div>
          <div className="header-sep"/>
          <div className="header-sub">Manufacturing Inspection System</div>
          <div className="header-right">
            <div className="user-ctrl">
              <div className="user-ctrl-label">Current User</div>
              <div className="user-ctrl-row">
                <select value={currentUserId} onChange={(e)=>setCurrentUserId(e.target.value)} disabled={!!authUser?.id}>
                  <option value="">Select user…</option>
                  {users.map(u=>(
                    <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
                  ))}
                </select>
                <span className={`role-chip role-${(currentRole||"").toLowerCase()}`}>{currentRole||"Unknown"}</span>
              </div>
              {authUser?.id?<div className="user-ctrl-hint">Authenticated session user is fixed for protected actions.</div>:null}
              {userLoadErr?<div className="user-ctrl-hint">{userLoadErr}</div>:null}
              {dataErr?<div className="user-ctrl-hint">{dataErr}</div>:null}
            </div>
            <span className={`data-chip ${dataChipClass}`}>{dataChipLabel}</span>
            {onLogout ? <button className="nav-btn" onClick={onLogout}>Sign Out</button> : null}
            <nav className="nav">
              {canViewOperator && <button className={`nav-btn ${view==="operator"?"active":""}`} onClick={()=>setView("operator")}>Operator Entry</button>}
              {canViewRecords && <button className={`nav-btn ${view==="records"?"active":""}`} onClick={()=>setView("records")}>Records</button>}
              {canViewAdmin && <button className={`nav-btn ${view==="admin"?"active":""}`} onClick={()=>setView("admin")}>Admin</button>}
            </nav>
          </div>
        </div>
        <div className="page">
          <TransitionBanner state={transitionState}/>
          {view==="operator" && (
            <OperatorView parts={parts} jobs={jobs} toolLibrary={toolLibrary} onSubmit={handleSubmit} onDraft={handleDraft} currentUserId={currentUserId} currentRole={currentRole} onLockJob={handleLockJob} onUnlockJob={handleUnlockJob} onRefreshData={reloadLiveData} dataStatus={dataStatus} usersById={usersById}/>
          )}
          {view==="records" && (
            <AdminRecords records={records} parts={parts} toolLibrary={toolLibrary} usersById={usersById} loadRecordDetail={loadRecordDetail} canEdit={canEditRecords} onEditValue={handleEditRecordValue}/>
          )}
          {view==="admin" && (
            <AdminView parts={parts} jobs={jobs} records={records} toolLibrary={toolLibrary} toolLocations={toolLocations} users={users} usersById={usersById} currentCaps={currentCaps} roleCaps={roleCaps} currentRole={currentRole} currentUserId={currentUserId} loadRecordDetail={loadRecordDetail} onEditValue={handleEditRecordValue} onCreateJob={handleCreateJob} onCreatePart={handleCreatePart} onUpdatePart={handleUpdatePart} onBulkUpdateParts={handleBulkUpdateParts} onCreateOp={handleCreateOp} onCreateDim={handleCreateDim} onUpdateDim={handleUpdateDim} onRemoveDim={handleRemoveDim} onCreateTool={handleCreateTool} onUpdateTool={handleUpdateTool} onCreateToolLocation={handleCreateToolLocation} onUpdateToolLocation={handleUpdateToolLocation} onRemoveToolLocation={handleRemoveToolLocation} onCreateUser={handleCreateUser} onUpdateUser={handleUpdateUser} onRemoveUser={handleRemoveUser} onUpdateRoleCaps={handleUpdateRoleCaps} onUnlockJob={handleUnlockJob} onRefreshData={reloadLiveData}/>
          )}
        </div>
      </>
    </ErrorBoundary>
  );
}
