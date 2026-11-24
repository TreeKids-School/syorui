import {useState} from 'react';
import {Pencil} from 'lucide-react';

/** 日付は通常は表示し、明示的に編集を開始したときだけ入力欄を開く。 */
export function InlineDateEditor({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState('');
  const parts=value.split('-');
  const display=parts.length===3&&parts.every(Boolean)?`${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`:value||'未入力';
  const action='min-h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 print:hidden';
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <span className="whitespace-nowrap">{label}：</span>
    {editing?<>
      <input type="date" aria-label={label} autoFocus value={draft} onChange={e=>setDraft(e.target.value)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm print:hidden"/>
      <button type="button" className={action} disabled={!draft} onClick={()=>{onChange(draft);setEditing(false);}}>完了</button>
      <button type="button" className={action} onClick={()=>setEditing(false)}>キャンセル</button>
      <span className="hidden print:inline">{display}</span>
    </>:<>
      <span>{display}</span>
      <button type="button" aria-label={label+'を編集'} className={action+' inline-flex items-center gap-2'} onClick={()=>{setDraft(parts.length===3?parts[0]+'-'+parts[1].padStart(2,'0')+'-'+parts[2].padStart(2,'0'):value);setEditing(true);}}><Pencil size={16}/>編集</button>
    </>}
  </div>;
}
