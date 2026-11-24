import {useIsMobile} from '../hooks/useIsMobile';
import {StaffAccountContext} from './StaffAccountBadge';
import {auth} from '../lib/firebase';
import {filterSummaryStaff,resolveOwnStaffId} from '../lib/summaryStaffFilter';
import {documentRoute} from '../lib/documentRoutes';
import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Check,ChevronDown,Search,ArrowDownUp} from 'lucide-react';
import type {Child} from '../data/mockData';
import type {DocumentType} from './DocumentIcon';
import {DropdownPanel} from './ui/DropdownPanel';
import {DropdownSelect} from './ui/DropdownSelect';
import {menuItemClass} from './ui/menuStyles';
import {KANA_ROWS,CHILD_SWITCH_ORDERS,filterSwitcherChildren} from '../lib/childSwitcherFilters';
import type {KanaRow} from '../lib/childSwitcherFilters';
import {japanDateKey} from '../lib/summaryChildOrder';
import type {SummaryChildOrder} from '../lib/summaryChildOrder';
import {loadChildListOrderData} from '../lib/childListOrderData';
import {officeAttendanceDates} from '../lib/supportOfficeAttendance';
import {describeReadError} from '../lib/readError';
export {normalizeChildSearch} from '../lib/childSwitcherFilters';

type Props={childId:string;name:string;childrenData:Child[];officeId:string;current:DocumentType;month:string};
type SortData=Awaited<ReturnType<typeof loadChildListOrderData>>;
function ChildSwitchList({childId,childrenData,officeId,onSelect}:{childId:string;childrenData:Child[];officeId:string;onSelect:(id:string)=>void}){
  const account=useContext(StaffAccountContext);
  const isMobile=useIsMobile();
  const [mobileAssignedOnly,setAssignedOnly]=useState(false);
  const assignedOnly=isMobile&&mobileAssignedOnly;
  const [query,setQuery]=useState(''),[kana,setKana]=useState<KanaRow>('all'),[order,setOrder]=useState<SummaryChildOrder>('original');
  const [cache,setCache]=useState<Record<string,SortData>>({}),[readError,setReadError]=useState<{key:string;message:string}|null>(null),[retry,setRetry]=useState(0);
  const root=useRef<HTMLDivElement>(null),today=japanDateKey();
  const kind=order==='today'?'today':order.startsWith('attendance-')?'month':order==='staff'?'staff':'none';
  const readKey=officeId+':'+today+':'+kind,needsRead=kind!=='none';
  const data=cache[readKey];
  const staffKey=officeId+':'+today+':staff',staffData=cache[staffKey];
  useEffect(()=>{
    if(!officeId||staffData)return;
    let cancelled=false;
    loadChildListOrderData(officeId,today,'staff').then(value=>{if(!cancelled)setCache(previous=>({...previous,[staffKey]:value}));}).catch(error=>{if(!cancelled)setReadError({key:staffKey,message:describeReadError(error)});});
    return()=>{cancelled=true;};
  },[officeId,today,staffKey,staffData,retry]);
  useEffect(()=>{
    if(!needsRead||data||!officeId)return;
    let cancelled=false;setReadError(null);
    loadChildListOrderData(officeId,today,order).then(value=>{if(!cancelled)setCache(previous=>({...previous,[readKey]:value}));}).catch(error=>{if(!cancelled)setReadError({key:readKey,message:describeReadError(error)});});
    return()=>{cancelled=true;};
  },[officeId,today,order,readKey,needsRead,data,retry]);
  const error=needsRead&&!officeId?'事業所を選択してください。':readError?.key===readKey?readError.message:'';
  const staffError=assignedOnly&&readError?.key===staffKey?readError.message:'';
  const loading=(needsRead&&!data&&!error)||(assignedOnly&&!staffData&&!staffError);
  const context=useMemo(()=>{
    const attendingToday=new Set<string>(),attendanceCounts:Record<string,{attendanceCount:number}>={};
    const day=Number(today.slice(5,7))+'月'+Number(today.slice(8,10))+'日';
    for(const child of childrenData){if(!child.id)continue;const dates=officeAttendanceDates(data?.reports||[],child,officeId,today.slice(0,7));attendanceCounts[child.id]={attendanceCount:dates.size};if(dates.has(day))attendingToday.add(child.id);}
    return {assignedStaff:staffData?.assignedStaff||{},staff:staffData?.staff||[],attendingToday,attendanceCounts};
  },[childrenData,data,staffData,officeId,today]);
  const staffById=new Map((staffData?.staff||[]).map(member=>[member.id,member]));
  const candidates=assignedOnly?filterSummaryStaff(childrenData,staffData?.assignedStaff||{},'mine',resolveOwnStaffId(staffData?.staff||[],auth.currentUser?.uid||'',account.name)):childrenData;
  const filtered=filterSwitcherChildren(candidates,query,kana,order,context);
  return <div ref={root} className="flex h-full min-h-0 flex-col" onKeyDown={event=>{
    if(event.defaultPrevented)return;
    const buttons=[...root.current!.querySelectorAll<HTMLButtonElement>('[data-child-option]')];
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(index<0){if(event.key==='ArrowDown'){event.preventDefault();buttons[0]?.focus();}return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  }}>
    <div className="flex shrink-0 items-center gap-2 bg-white p-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2"><Search size={17} aria-hidden="true" className="shrink-0 text-slate-400"/><input type="search" aria-label="児童名・ふりがなで検索" placeholder="名前・ふりがなで検索" value={query} onChange={event=>setQuery(event.target.value)} className="min-h-10 min-w-0 w-full bg-transparent text-sm outline-none"/></label><DropdownSelect label="児童の並べ替え" value={order} options={CHILD_SWITCH_ORDERS} toggles={isMobile?[{label:'担当児童のみ表示',checked:assignedOnly,onChange:setAssignedOnly}]:[]} onChange={setOrder} iconOnly icon={<ArrowDownUp size={18}/>}/></div>
    <div role="group" aria-label="読み仮名の行で絞り込み（選択中の行を再度押すと解除）" className="grid shrink-0 grid-cols-5 gap-1 border-b border-slate-100 px-2 pb-2">{KANA_ROWS.map(row=><button type="button" key={row} aria-label={row+'行の児童'} aria-pressed={kana===row} onClick={()=>setKana(current=>current===row?'all':row)} className={'min-h-8 rounded-lg border text-xs '+(kana===row?'border-primary bg-primary/10 font-semibold text-primary':'border-slate-200 text-slate-700 hover:bg-slate-50')}>{row}</button>)}</div>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pt-1" data-child-results>
      {loading?<p role="status" className="px-3 py-4 text-sm text-slate-500">並べ替え情報を読み込み中…</p>:(error||staffError)?<div role="alert" className="space-y-2 px-3 py-3 text-sm text-rose-600"><p>{error||staffError}</p><button type="button" onClick={()=>setRetry(value=>value+1)} className="min-h-10 rounded-xl border px-3">再試行</button></div>:filtered.map(child=><button key={child.id} type="button" data-child-option aria-current={child.id===childId?'true':undefined} onClick={()=>onSelect(child.id!)} className={menuItemClass+(child.id===childId?' bg-primary/10 text-primary':'')}><span className="min-w-0"><span className="flex items-center gap-2"><span>{child.fullName}</span>{staffData&&<span role="img" aria-label={'担当：'+(staffById.get(staffData.assignedStaff[child.id!])?.name||'未設定')} title={'担当：'+(staffById.get(staffData.assignedStaff[child.id!])?.name||'未設定')} className="inline-block h-4 w-4 shrink-0 rounded-full shadow-2xs" style={{backgroundColor:staffById.get(staffData.assignedStaff[child.id!])?.color||'#cbd5e1'}}/>}</span>{child.nameKana&&<span className="mt-0.5 block text-xs text-slate-500">{child.nameKana}</span>}</span>{child.id===childId&&<Check size={17} className="shrink-0" aria-hidden="true"/>}</button>)}
      {!loading&&!error&&!staffError&&!filtered.length&&<p className="px-3 py-4 text-sm text-slate-500">{order==='today'?'条件に合う本日出席予定の児童はいません。':'該当する児童がいません。'}</p>}
    </div>
  </div>;
}
export function ChildSwitcher(props:Props){
  const {childId,name,childrenData,officeId,current,month}=props;
  const navigate=useNavigate();
  return <DropdownPanel label="児童を切り替え" variant="content" itemCount={8} preferredHeight={680} mobileBottom contained triggerContent={<span className="inline-flex min-w-0 items-center gap-2 text-lg font-bold text-slate-800 md:text-xl"><span className="break-words text-left">{name} 様</span><ChevronDown size={14} className="shrink-0" aria-hidden="true"/></span>}>
    {close=><ChildSwitchList key={officeId} childId={childId} childrenData={childrenData} officeId={officeId} onSelect={id=>{close();if(id!==childId)navigate(documentRoute(current,id,month));}}/>}
  </DropdownPanel>;
}
