import {useContext,useState} from 'react';
import {AccountTasksContext} from './AccountTasksProvider';
import {AccountTaskList} from './AccountTaskList';
import {DropdownPanel} from './ui/DropdownPanel';
import {menuActionClass} from './ui/menuStyles';
import {Bell,LogOut,Loader2,Settings} from 'lucide-react';
import {auth} from '../lib/firebase';
import {StaffAccountBadge} from './StaffAccountBadge';

/** デスクトップのヘッダー右端に置く通知・アカウント。 */
export function HeaderAccountActions({mobile=false}:{mobile?:boolean}) {
  const tasks=useContext(AccountTasksContext);
  const [signingOut,setSigningOut]=useState(false);
  const [error,setError]=useState('');
  return <div className={(mobile?'flex md:hidden':'hidden md:flex')+' shrink-0 items-center gap-3 border-l border-slate-200 pl-3 print:hidden'}>
    <DropdownPanel label="通知" onOpen={tasks.refresh} preferredHeight={520} icon={<span className="relative"><Bell size={20}/>{tasks.notifications.length>0&&<span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white" aria-label={tasks.notifications.length+'件の通知'}>{tasks.notifications.length}</span>}</span>}>
      {close=><AccountTaskList notificationsOnly close={close}/>}
    </DropdownPanel>
    <DropdownPanel label="アカウント" onOpen={tasks.refresh} preferredHeight={520} variant="content" triggerContent={<span className={mobile?'[&>span>span:last-child]:hidden':''}><StaffAccountBadge/></span>}>
      {close=><>
      <button type="button" disabled={signingOut} className={menuActionClass+' sticky top-0 z-10 shrink-0 bg-white text-rose-600 hover:bg-rose-50'} onClick={async()=>{
        setSigningOut(true);setError('');
        try{await auth.signOut();}catch{setError('ログアウトできませんでした。もう一度お試しください。');setSigningOut(false);}
      }}>{signingOut?<Loader2 size={18} className="animate-spin"/>:<LogOut size={18}/>}<span>{signingOut?'ログアウト中…':'ログアウト'}</span></button>
      {error&&<p role="alert" className="px-3 py-2 text-xs text-rose-600">{error}</p>}
      <button type="button" className={menuActionClass+' border-b border-slate-100'} onClick={()=>{close();tasks.openTaskSettings();}}><Settings size={18}/><span>タスク設定</span></button>
      <AccountTaskList notificationsOnly={false} close={close}/>
      </>}
    </DropdownPanel>
  </div>;
}
