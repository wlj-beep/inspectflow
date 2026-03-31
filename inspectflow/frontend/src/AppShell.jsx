import React, { useState, useRef, useEffect } from "react";
import { api } from "./api/index.js";
import { createJobflowAdapter } from "./domains/jobflow/adapter.js";
import { DEFAULT_ROLE_CAPS } from "./domains/jobflow/constants.js";
import {
  buildPartsFromApi,
  mapJobsFromApi,
  mapRecordDetailFromApi,
  mapRecordsFromApi,
  mapToolLibrary,
  mapToolLocations
} from "./domains/jobflow/mappers.js";
import { TableSkeleton, Breadcrumbs } from "./ui/feedback.jsx";
import { HomeDashboard } from "./ui/homeDashboard.jsx";
import { readUiRouteState, writeUiRouteState, buildBreadcrumbs } from "./ui/navigation.js";
import { OperatorView } from "./ui/OperatorView.jsx";
import { AdminView } from "./ui/AdminView.jsx";
import { AdminRecords } from "./ui/AdminRecords.jsx";
import { TransitionBanner } from "./ui/TransitionBanner.jsx";
import { ShortcutHelpOverlay } from "./ui/shortcutHelp.jsx";
import { useToastStack, ToastStack } from "./ui/toast.jsx";
import { getRoleThemeClass, getRoleAccentLabel } from "./ui/roleTheme.js";
import { INITIAL_TOOLS, INITIAL_PARTS, INITIAL_JOBS, INITIAL_RECORDS, INITIAL_USERS } from "./data/initialData.js";
import { isOOT, nextRevisionCode, revisionCodeToIndex, uid, normalizeOpNumber } from "./ui/appHelpers.js";
import "./ui/app.css";

const jobflowAdapter = createJobflowAdapter(api);

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

export default function AppShell({ authUser = null, onLogout = null }) {
  const initialRoute = readUiRouteState();
  const [view,setView]=useState(initialRoute.view || "home");
  const [adminTab,setAdminTab]=useState(initialRoute.adminTab || "jobs");
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
  const [showShortcutHelp,setShowShortcutHelp]=useState(false);
  const { toasts, pushToast, dismissToast } = useToastStack();

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
      pushToast({ tone:"success", message:`${actionLabel} complete.` });
      return result;
    }catch(err){
      const detail=err?.message ? ` ${err.message}` : "";
      setTransition("error", `${actionLabel} failed.${detail}`, 7000);
      pushToast({ tone:"error", message:`${actionLabel} failed.${detail}`, sticky:true });
      throw err;
    }
  }

  useEffect(()=>()=>{ if(transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current); },[]);
  useEffect(()=>{
    const onKeyDown=(event)=>{
      if(event.key==="?"){
        event.preventDefault();
        setShowShortcutHelp(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return ()=>window.removeEventListener("keydown", onKeyDown);
  },[]);

  useEffect(()=>{
    let active=true;
    jobflowAdapter.users.list(currentRole || "Operator")
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
        const rows = await jobflowAdapter.roles.list(currentRole);
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
      jobflowAdapter.sessions.end(Number(prev), currentRole).catch(()=>{});
    }
    if(next && next!==prev){
      jobflowAdapter.sessions.start(Number(next), currentRole).catch(()=>{});
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
        const {
          toolsList,
          toolLocationsList,
          partDetails,
          jobsList,
          recordsList
        } = await jobflowAdapter.loadBootstrap(role);
        const { partsObj, opIdToNumber: opMap } = buildPartsFromApi(partDetails);
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
      const {
        toolsList,
        toolLocationsList,
        partDetails,
        jobsList,
        recordsList
      } = await jobflowAdapter.loadBootstrap(role);
      const { partsObj, opIdToNumber: opMap } = buildPartsFromApi(partDetails);
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
  const crumbs = buildBreadcrumbs({ view, adminTab });
  const roleThemeClass=getRoleThemeClass(currentRole);
  const roleAccentLabel=getRoleAccentLabel(currentRole);
  function navigateView(nextView){
    setView(nextView);
    if(nextView==="admin" && !adminTab){
      setAdminTab("jobs");
    }
  }
  useEffect(()=>{
    writeUiRouteState({ view, adminTab });
  },[view,adminTab]);

  useEffect(()=>{
    if(view==="admin" && !canViewAdmin) navigateView(canViewOperator?"operator":"records");
    if(view==="operator" && !canViewOperator) navigateView(canViewAdmin?"admin":"records");
    if(view==="records" && !canViewRecords) navigateView(canViewOperator?"operator":"admin");
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
    const detail=await jobflowAdapter.records.get(id, role);
    return mapRecordDetailFromApi(detail, opIdToNumber, usersById);
  }
  const dataChipLabel = dataStatus==="live" ? "Live Data" : dataStatus==="loading" ? "Loading" : "Local Demo";
  const dataChipClass = dataStatus==="live" ? "data-live" : dataStatus==="loading" ? "data-loading" : "data-fallback";
  const signedInUserName = authUser?.name || usersById?.[String(authUser?.id)] || "Authenticated user";
  return (
    <ErrorBoundary>
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <ShortcutHelpOverlay open={showShortcutHelp} onClose={()=>setShowShortcutHelp(false)} />
        <div className={`app-header ${roleThemeClass}`}>
          <div className="logo"><div className="logo-icon"/>InspectFlow</div>
          <div className="header-sep"/>
          <div>
            <div className="header-sub">Manufacturing Inspection System</div>
            <div className="role-accent">{roleAccentLabel}</div>
          </div>
          <div className="header-right">
            <div className="user-ctrl">
              {authUser?.id ? (
                <div className="user-ctrl-identity">{signedInUserName}</div>
              ) : (
                <>
                  <div className="user-ctrl-label">Current User</div>
                  <div className="user-ctrl-row">
                    <select value={currentUserId} onChange={(e)=>setCurrentUserId(e.target.value)}>
                      <option value="">Select user…</option>
                      {users.map(u=>(
                        <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
                      ))}
                    </select>
                    <span className={`role-chip role-${(currentRole||"").toLowerCase()}`}>{currentRole||"Unknown"}</span>
                  </div>
                </>
              )}
              {authUser?.id?<div className="user-ctrl-hint">Authenticated session user is fixed for protected actions.</div>:null}
              {userLoadErr?<div className="user-ctrl-hint">{userLoadErr}</div>:null}
              {dataErr?<div className="user-ctrl-hint">{dataErr}</div>:null}
            </div>
            <span className={`data-chip ${dataChipClass}`}>{dataChipLabel}</span>
            {onLogout ? <button className="nav-btn" onClick={onLogout}>Sign Out</button> : null}
            <nav className="nav">
              <button className={`nav-btn ${view==="home"?"active":""}`} onClick={()=>navigateView("home")}>Home</button>
              {canViewOperator && <button className={`nav-btn ${view==="operator"?"active":""}`} onClick={()=>navigateView("operator")}>Operator Entry</button>}
              {canViewRecords && <button className={`nav-btn ${view==="records"?"active":""}`} onClick={()=>navigateView("records")}>Records</button>}
              {canViewAdmin && <button className={`nav-btn ${view==="admin"?"active":""}`} onClick={()=>navigateView("admin")}>Admin</button>}
            </nav>
          </div>
        </div>
        <div className="page">
          <Breadcrumbs items={crumbs} />
          <TransitionBanner state={transitionState}/>
          {dataStatus==="loading" && <TableSkeleton rows={8} columns={8} ariaLabel="Loading application data" />}
          {dataStatus!=="loading" && view==="home" && (
            <HomeDashboard
              jobs={Object.values(jobs || {})}
              records={records}
              toolLibrary={toolLibrary}
              currentRole={currentRole}
              onNavigate={navigateView}
            />
          )}
          {dataStatus!=="loading" && view==="operator" && (
            <OperatorView parts={parts} jobs={jobs} toolLibrary={toolLibrary} onSubmit={handleSubmit} onDraft={handleDraft} currentUserId={currentUserId} currentRole={currentRole} onLockJob={handleLockJob} onUnlockJob={handleUnlockJob} onRefreshData={reloadLiveData} dataStatus={dataStatus} usersById={usersById}/>
          )}
          {dataStatus!=="loading" && view==="records" && (
            <AdminRecords records={records} parts={parts} toolLibrary={toolLibrary} usersById={usersById} loadRecordDetail={loadRecordDetail} canEdit={canEditRecords} onEditValue={handleEditRecordValue}/>
          )}
          {dataStatus!=="loading" && view==="admin" && (
            <AdminView parts={parts} jobs={jobs} records={records} toolLibrary={toolLibrary} toolLocations={toolLocations} users={users} usersById={usersById} currentCaps={currentCaps} roleCaps={roleCaps} currentRole={currentRole} currentUserId={currentUserId} adminTab={adminTab} onAdminTabChange={setAdminTab} loadRecordDetail={loadRecordDetail} onEditValue={handleEditRecordValue} onCreateJob={handleCreateJob} onCreatePart={handleCreatePart} onUpdatePart={handleUpdatePart} onBulkUpdateParts={handleBulkUpdateParts} onCreateOp={handleCreateOp} onCreateDim={handleCreateDim} onUpdateDim={handleUpdateDim} onRemoveDim={handleRemoveDim} onCreateTool={handleCreateTool} onUpdateTool={handleUpdateTool} onCreateToolLocation={handleCreateToolLocation} onUpdateToolLocation={handleUpdateToolLocation} onRemoveToolLocation={handleRemoveToolLocation} onCreateUser={handleCreateUser} onUpdateUser={handleUpdateUser} onRemoveUser={handleRemoveUser} onUpdateRoleCaps={handleUpdateRoleCaps} onUnlockJob={handleUnlockJob} onRefreshData={reloadLiveData}/>
          )}
        </div>
      </>
    </ErrorBoundary>
  );
}
