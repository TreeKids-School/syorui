import {useState} from 'react';
import {DropdownPanel} from './ui/DropdownPanel';
import {menuActionClass} from './ui/menuStyles';
import {Bell,LogOut,Loader2} from 'lucide-react';
import {auth} from '../lib/firebase';
import {StaffAccountBadge} from './StaffAccountBadge';

/** デスクトップのヘッダー右端に置く通知・アカウント。 */
export function HeaderAccountActions() {
  const [signingOut,setSigningOut]=useState(false);
  const [error,setError]=useState('');
  return <div className="hidden shrink-0 items-center gap-3 border-l border-slate-200 pl-3 md:flex print:hidden">
    <DropdownPanel label="通知" icon={<Bell size={20}/>}>
      <p role="status" className="px-3 py-4 text-sm leading-relaxed text-slate-500">新しい通知はありません。</p>
    </DropdownPanel>
    <DropdownPanel label="アカウント" variant="content" triggerContent={<StaffAccountBadge/>}>
      <button type="button" disabled={signingOut} className={menuActionClass+' text-rose-600 hover:bg-rose-50'} onClick={async()=>{
        setSigningOut(true);setError('');
        try{await auth.signOut();}catch{setError('ログアウトできませんでした。もう一度お試しください。');setSigningOut(false);}
      }}>{signingOut?<Loader2 size={18} className="animate-spin"/>:<LogOut size={18}/>}<span>{signingOut?'ログアウト中…':'ログアウト'}</span></button>
      {error&&<p role="alert" className="px-3 py-2 text-xs text-rose-600">{error}</p>}
    </DropdownPanel>
  </div>;
}
