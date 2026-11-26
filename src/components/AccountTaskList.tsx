import {useContext} from 'react';
import {useNavigate} from 'react-router-dom';
import {AccountTasksContext} from './AccountTasksProvider';
import {DocumentIcon} from './DocumentIcon';
import {Settings} from 'lucide-react';
import {menuActionClass} from './ui/menuStyles';
export function AccountTaskList({notificationsOnly,close}:{notificationsOnly:boolean;close:()=>void}){
  const state=useContext(AccountTasksContext),navigate=useNavigate(),tasks=notificationsOnly?state.notifications:state.tasks;
  return <>
    {notificationsOnly?<button type="button" className={menuActionClass+' border-b border-slate-100'} onClick={()=>{close();state.openSettings();}}><Settings size={18}/><span>通知設定</span></button>:<h4 className="px-3 pt-3 text-xs font-semibold text-slate-500">自分のタスク　{state.tasks.length}件</h4>}
    <div role="region" aria-label={notificationsOnly?'期限の通知一覧':'タスク一覧'} tabIndex={0} className="max-h-[min(320px,50dvh)] overflow-y-auto overscroll-contain rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
    {state.error&&<p role="alert" className="px-3 py-2 text-sm text-rose-600">{state.error}</p>}
    {state.loading?<p role="status" className="px-3 py-4 text-sm text-slate-500">タスクを確認中…</p>:tasks.length?tasks.map(task=><button key={task.id} type="button" className={menuActionClass+' items-start border-b border-slate-100 text-left'} onClick={()=>{close();navigate(task.href);}}><DocumentIcon type={task.book}/><span className="min-w-0"><span className="block text-sm font-semibold">{notificationsOnly?task.message:task.childName+'の'+task.label}</span><span className={'mt-1 block text-xs '+(task.daysLeft<0?'text-rose-600':'text-slate-500')}>{task.dueDate.replaceAll('-','/')}　{task.daysLeft<0?'期限を'+Math.abs(task.daysLeft)+'日超過':task.daysLeft===0?'本日期限':'残り'+task.daysLeft+'日'}</span></span></button>):!state.error&&<p role="status" className="px-3 py-4 text-sm leading-relaxed text-slate-500">{notificationsOnly?'期限が近い通知はありません。':'現在のタスクはありません。'}</p>}
    </div>
  </>;
}
