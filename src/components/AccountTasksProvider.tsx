import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {collection,doc,getDocFromServer,getDocsFromServer,setDoc} from 'firebase/firestore';
import {auth,db} from '../lib/firebase';
import {measureRead} from '../lib/readDiagnostics';
import {describeReadError} from '../lib/readError';
import {japanDateKey} from '../lib/summaryChildOrder';
import {resolveOwnStaffId} from '../lib/summaryStaffFilter';
import {completedImplementationChildren,implementationCompletionPath} from '../lib/implementationCompletion';
import {buildAccountTasks,DEFAULT_NOTIFICATION_SETTINGS,notificationSettings,staffTaskRole,DEFAULT_TASK_DISPLAY_SETTINGS,taskDisplaySettings,visibleAccountTasks} from '../lib/accountTasks';
import type {AccountTask,TaskPlan} from '../lib/accountTasks';
import {ACCOUNT_TASKS_CHANGED} from '../lib/accountTaskEvents';
import {StaffAccountContext} from './StaffAccountBadge';
import {ViewportModal} from './ViewportModal';
import {SettingsGroup,settingsRowClass} from './SettingsGroup';
import {DropdownSelect} from './ui/DropdownSelect';
import {Settings,X} from 'lucide-react';

type TasksContext={tasks:AccountTask[];notifications:AccountTask[];loading:boolean;error:string;role:'manager'|'staff'|'unknown';refresh:()=>void;openSettings:()=>void;openTaskSettings:()=>void};
export const AccountTasksContext=createContext<TasksContext>({tasks:[],notifications:[],loading:false,error:'',role:'unknown',refresh:()=>{},openSettings:()=>{},openTaskSettings:()=>{}});
export function AccountTasksProvider({uid,officeId,childrenData,plans,enabled,refreshPlans,children}:{uid:string;officeId:string;childrenData:{id?:string;fullName:string;archived?:boolean}[];plans:TaskPlan[];enabled:boolean;refreshPlans:()=>void;children:ReactNode}){
  const account=useContext(StaffAccountContext),[today,setToday]=useState(japanDateKey),month=today.slice(0,7);
  const [staffError,setStaffError]=useState(''),[staffRetry,setStaffRetry]=useState(0),[settingsRetry,setSettingsRetry]=useState(0);
  const [taskSettings,setTaskSettings]=useState(DEFAULT_TASK_DISPLAY_SETTINGS),[taskDraft,setTaskDraft]=useState(DEFAULT_TASK_DISPLAY_SETTINGS),[settingsMode,setSettingsMode]=useState<'notifications'|'tasks'>('notifications');
  const [settings,setSettings]=useState(DEFAULT_NOTIFICATION_SETTINGS),[settingsReady,setSettingsReady]=useState(false),[settingsError,setSettingsError]=useState('');
  const [data,setData]=useState<{scope:string;assignments:Record<string,string>;completed:Set<string>}>({scope:'',assignments:{},completed:new Set()});
  const [staff,setStaff]=useState<{scope:string;members:{id:string;name:string;role:'manager'|'staff'|'unknown'}[]}>({scope:'',members:[]});
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[settingsOpen,setSettingsOpen]=useState(false),[saving,setSaving]=useState(false),[draft,setDraft]=useState(settings);
  const scope=uid+':'+officeId+':'+month,lastRead=useRef(0),sequence=useRef(0);
  useEffect(()=>{const tick=()=>setToday(japanDateKey());const timer=setInterval(tick,60_000);window.addEventListener('focus',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);};},[]);
  useEffect(()=>{let cancelled=false;setSettingsReady(false);setSettingsError('');if(!uid)return;
    void measureRead('通知設定',getDocFromServer(doc(db,'staff',uid,'app_preferences','document_management'))).then(snapshot=>{if(!cancelled){setSettings(notificationSettings(snapshot.data()?.notificationSettings));setTaskSettings(taskDisplaySettings(snapshot.data()?.taskSettings));setSettingsReady(true);}}).catch(error=>{if(!cancelled)setSettingsError(describeReadError(error));});return()=>{cancelled=true;};
  },[uid,settingsRetry]);
  useEffect(()=>{let cancelled=false;if(!enabled||!uid||!officeId)return;setStaffError('');setStaff({scope:'',members:[]});
    void measureRead('タスクの担当者照合',getDocsFromServer(collection(db,'staff'))).then(snapshot=>{if(!cancelled)setStaff({scope:uid+':'+officeId,members:snapshot.docs.filter(item=>{const value=item.data();return !(value.archived===true||value.isArchived===true||value.status==='archived'||value.active===false||value.deleted===true||value.isDeleted===true)&&(!value.officeId||value.officeId===officeId||value.officeIds?.includes?.(officeId));}).map(item=>({id:item.id,name:item.data().name||item.data().fullName||'',role:staffTaskRole(item.data())}))});}).catch(error=>{if(!cancelled){setStaffError(describeReadError(error));setStaff({scope:uid+':'+officeId,members:[]});}});return()=>{cancelled=true;};
  },[uid,officeId,enabled,staffRetry]);
  useEffect(()=>{if(!enabled||!uid||!officeId)return;let cancelled=false;const ticket=++sequence.current;setLoading(true);setError('');
    void Promise.all([measureRead('通知の担当児童',getDocFromServer(doc(db,'offices',officeId,'monthly_staff_assignments',month))),measureRead('通知の月次完了',getDocFromServer(doc(db,...implementationCompletionPath(officeId,month))))]).then(([assignments,completion])=>{if(!cancelled&&ticket===sequence.current){setData({scope,assignments:assignments.data()?.assignments||{},completed:completedImplementationChildren(completion.data())});lastRead.current=Date.now();}}).catch(error=>{if(!cancelled)setError(describeReadError(error));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};
  },[scope,uid,officeId,month,enabled,reload]);
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const changed=(event:Event)=>{if((event as CustomEvent).detail?.officeId!==officeId)return;clearTimeout(timer);timer=setTimeout(()=>setReload(value=>value+1),300);};window.addEventListener(ACCOUNT_TASKS_CHANGED,changed);return()=>{clearTimeout(timer);window.removeEventListener(ACCOUNT_TASKS_CHANGED,changed);};},[officeId]);
  const members=staff.scope===uid+':'+officeId?staff.members:[],ownStaffId=resolveOwnStaffId(members,uid,account.name),role=account.taskRole&&account.taskRole!=='unknown'?account.taskRole:members.find(member=>member.id===ownStaffId)?.role||'unknown';
  const allTasks=useMemo(()=>data.scope===scope?buildAccountTasks({today,officeId,children:childrenData,ownStaffId,assignments:data.assignments,completed:data.completed,plans,role,settings}):[],[data,scope,today,officeId,childrenData,ownStaffId,plans,role,settings]);
  const notifications=allTasks.filter(task=>task.notifyDate<=today);
  const tasks=useMemo(()=>visibleAccountTasks(allTasks,today,taskSettings),[allTasks,today,taskSettings]);
  useEffect(()=>{if(settingsOpen&&settingsReady){setDraft(settings);setTaskDraft(taskSettings);}},[settingsOpen,settingsReady,settings,taskSettings]);
  const refresh=useCallback(()=>{if(staffError)setStaffRetry(value=>value+1);if(settingsError&&!settingsReady)setSettingsRetry(value=>value+1);if(Date.now()-lastRead.current>=60_000&&!loading){setReload(value=>value+1);refreshPlans();}},[loading,refreshPlans,staffError,settingsError,settingsReady]);
  return <AccountTasksContext.Provider value={{tasks,notifications,loading:!error&&!staffError&&(loading||data.scope!==scope||staff.scope!==uid+':'+officeId),error:error||staffError||settingsError,role,refresh,openSettings:()=>{setSettingsMode('notifications');setDraft(settings);setSettingsOpen(true);},openTaskSettings:()=>{setSettingsMode('tasks');setTaskDraft(taskSettings);setSettingsOpen(true);}}}>
    {children}
    {settingsOpen&&<ViewportModal className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-900/50 p-4 print:hidden"><form role="dialog" aria-modal="true" aria-labelledby="notification-settings-title" className="w-full max-w-lg space-y-5 rounded-2xl bg-slate-50 p-6 shadow-xl" onSubmit={async event=>{event.preventDefault();if(!settingsReady||saving||auth.currentUser?.uid!==uid)return;setSaving(true);setSettingsError('');try{if(settingsMode==='tasks'){const value=taskDisplaySettings(taskDraft),next=role==='manager'?value:{...taskSettings,implementation:value.implementation};await setDoc(doc(db,'staff',uid,'app_preferences','document_management'),{taskSettings:next},{merge:true});setTaskSettings(next);}else{const value=notificationSettings(draft);await setDoc(doc(db,'staff',uid,'app_preferences','document_management'),{notificationSettings:role==='manager'?value:{implementationDays:value.implementationDays,professionalMonths:settings.professionalMonths}},{merge:true});setSettings(role==='manager'?value:{...settings,implementationDays:value.implementationDays});}setSettingsOpen(false);}catch(error){setSettingsError(describeReadError(error));}finally{setSaving(false);}}}>
      <header className="flex items-center justify-between"><h2 id="notification-settings-title" className="flex items-center gap-2 font-bold"><Settings size={18}/>{settingsMode==='tasks'?'タスク設定':'通知設定'}</h2><button type="button" aria-label={settingsMode==='tasks'?'タスク設定を閉じる':'通知設定を閉じる'} onClick={()=>setSettingsOpen(false)} className="min-h-10 min-w-10 rounded-xl hover:bg-slate-200"><X size={18} className="mx-auto"/></button></header>
      <p className="text-sm text-slate-600">{account.name||'アカウント'}：{role==='manager'?'管理者':role==='staff'?'保育士・指導員':'役割未設定'}</p>
      {settingsMode==='tasks'?<>
        <SettingsGroup title="担当児童の専門的支援実施計画"><div className={settingsRowClass}><span>期限前の表示開始</span><DropdownSelect showSelectedLabel label="タスクの表示時期" value={taskDraft.implementation} onChange={value=>setTaskDraft(previous=>({...previous,implementation:taskDisplaySettings({implementation:value}).implementation}))} options={[{value:'1d',label:'1日前'},{value:'1w',label:'1週間前'},{value:'1m',label:'1か月前'}]}/></div></SettingsGroup>
        {role==='manager'&&<SettingsGroup title="個別支援計画書（管理者）"><div className={settingsRowClass}><span>期限前の表示開始</span><DropdownSelect showSelectedLabel label="タスクの表示時期" value={taskDraft.professional} onChange={value=>setTaskDraft(previous=>({...previous,professional:taskDisplaySettings({professional:value}).professional}))} options={[{value:'1d',label:'1日前'},{value:'1w',label:'1週間前'},{value:'1m',label:'1か月前'}]}/></div></SettingsGroup>}
      </>:<>
      <SettingsGroup title="担当児童の専門的支援実施計画"><div className={settingsRowClass}><span>月末の何日前から通知するか</span><DropdownSelect showSelectedLabel label="通知時期" value={String(draft.implementationDays)} onChange={value=>setDraft(previous=>({...previous,implementationDays:Number(value)}))} options={[0,1,3,7,14].map(days=>({value:String(days),label:days===0?'当日':days===7?'1週間前':days===14?'2週間前':days+'日前'}))}/></div></SettingsGroup>
      {role==='manager'&&<SettingsGroup title="個別支援計画書（管理者）"><div className={settingsRowClass}><span>本案の開始日から6か月となる日</span><DropdownSelect showSelectedLabel label="通知時期" value={String(draft.professionalMonths)} onChange={value=>setDraft(previous=>({...previous,professionalMonths:Number(value)}))} options={[0,1,2,3].map(months=>({value:String(months),label:months===0?'当日':months+'か月前'}))}/></div></SettingsGroup>}
      </>}
      {!settingsReady&&!settingsError&&<p role="status" className="text-sm text-slate-500">{settingsMode==='tasks'?'タスク設定':'通知設定'}を読み込み中…</p>}{settingsError&&<p role="alert" className="text-sm text-rose-600">{settingsError}{!settingsReady&&<button type="button" onClick={()=>setSettingsRetry(value=>value+1)} className="ml-3 min-h-10 rounded-xl border px-3">再試行</button>}</p>}
      <footer className="flex justify-end gap-3"><button type="button" onClick={()=>setSettingsOpen(false)} className="min-h-10 rounded-xl border bg-white px-4 text-sm">キャンセル</button><button type="submit" disabled={!settingsReady||saving} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{saving?'保存中…':'設定を保存'}</button></footer>
    </form></ViewportModal>}
  </AccountTasksContext.Provider>;
}
