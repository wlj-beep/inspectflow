export function isOOT(value,tolPlus,tolMinus,nominal){
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
export function formatValue(value, dim){
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
export function splitRangeValue(value){
  if(!value || !String(value).includes("|")) return ["",""];
  const [minRaw,maxRaw]=String(value).split("|");
  return [minRaw || "", maxRaw || ""];
}
export function isValidNonNegativeNumber(value){
  if(value===undefined || value===null || String(value).trim()==="") return false;
  const n=Number(value);
  return Number.isFinite(n) && n >= 0;
}
export function fmtSpec(dim){
  const dec=dim.unit==="Ra"?1:4;
  const n=parseFloat(dim.nominal).toFixed(dec);
  const p=parseFloat(dim.tolPlus).toFixed(dec);
  const m=parseFloat(dim.tolMinus).toFixed(dec);
  return p===m?`${n} \u00b1${p} ${dim.unit}`:`${n} +${p}/\u2212${m} ${dim.unit}`;
}
export function uid(){ return Math.random().toString(36).slice(2,8); }
export function nowStr(){ return new Date().toISOString().slice(0,16).replace("T"," "); }
export function fmtTs(ts){
  if(!ts)return "";
  const d=new Date(ts);
  if(isNaN(d)) return String(ts).slice(0,16).replace("T"," ");
  return d.toISOString().slice(0,16).replace("T"," ");
}
export function normalizeOpNumber(value){
  const raw=String(value ?? "").trim();
  if(!/^\d{1,3}$/.test(raw)) return null;
  const n=Number(raw);
  if(!Number.isInteger(n) || n < 1 || n > 999) return null;
  return String(n).padStart(3,"0");
}
export function revisionCodeToIndex(value){
  const code=String(value||"").trim().toUpperCase();
  if(!/^[A-Z]+$/.test(code)) return null;
  let idx=0;
  for(const ch of code){
    idx=(idx*26)+(ch.charCodeAt(0)-64);
  }
  return idx;
}
export function revisionIndexToCode(value){
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
export function nextRevisionCode(value){
  const idx=revisionCodeToIndex(value);
  if(!idx) return "A";
  return revisionIndexToCode(idx+1) || "A";
}
export function isToolSelectable(t){
  if(!t) return false;
  return t.active !== false && t.visible !== false;
}
