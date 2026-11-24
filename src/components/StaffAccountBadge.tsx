import {createContext, useContext} from 'react';
import {User} from 'lucide-react';
import type {StaffAccount} from '../lib/staffAccount';

export const StaffAccountContext = createContext<StaffAccount>({name: '', color: '#64748b'});
export function StaffAccountBadge({compact = false}: {compact?: boolean}) {
  const account = useContext(StaffAccountContext);
  const name = account.name || 'アカウント';
  return <span title={name} aria-label={`アカウント：${name}`} className={compact ? 'flex w-full flex-col items-center gap-1 px-1' : 'flex items-center gap-3'}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm" style={{backgroundColor: account.color}}>
      {account.name ? Array.from(account.name)[0] : <User size={18} />}
    </span>
    <span className={compact ? 'w-full break-all text-center text-[10px] font-semibold leading-snug text-slate-600' : 'text-sm font-semibold text-slate-800'}>{name}</span>
  </span>;
}
