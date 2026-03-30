import React, { useState, useRef, useEffect } from "react";
import { TOOL_TYPES, isToolSelectable } from "./adminConstants.js";

export function TypeBadge({ type, small }){
  const s=small?{fontSize:".58rem",padding:".08rem .3rem"}:{};
  if(type==="Go/No-Go") return <span className="tbadge tbadge-gng" style={s}>Go/No-Go</span>;
  if(type==="Attribute") return <span className="tbadge tbadge-attr" style={s}>Attribute</span>;
  return <span className="tbadge tbadge-var" style={s}>Variable</span>;
}

export function AutocompleteInput({ value, onChange, options, placeholder, style, renderOption, filterFn }) {
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

export function ToolSearchPopover({ toolLibrary, selectedIds, onAdd, onRemove }) {
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
