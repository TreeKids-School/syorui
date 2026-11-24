import {auditDocumentWrite} from '../lib/documentAudit';
import {useEffect,useRef,useState} from 'react';
import {serverTimestamp,writeBatch} from 'firebase/firestore';
import {getMonthlySettings,monthlySettingsRef} from '../lib/monthlySettings';
import {describeReadError} from '../lib/readError';
import {ViewportModal} from './ViewportModal';
import {SettingsGroup,settingsRowClass} from './SettingsGroup';

type AuthorDraft={implementationCreator:string;implementationYear:string;implementationMonth:string;implementationDay:string};
const EMPTY:AuthorDraft={implementationCreator:'',implementationYear:'',implementationMonth:'',implementationDay:''};
export function ImplementationAuthorSettings({officeId,officeName,month,onSaved,onClose}:{officeId:string;officeName:string;month:string;onSaved:(settings:Record<string,any>)=>void;onClose:()=>void}){
  const [draft,setDraft]=useState<AuthorDraft>(EMPTY),[inherited,setInherited]=useState<Record<string,any>>({});
  const [loaded,setLoaded]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    let cancelled=false;setLoaded(false);setError('');
    getMonthlySettings(officeId,month).then(snapshot=>{
      if(cancelled)return;const value=snapshot.exists()?snapshot.data():{};
      setInherited(value);setDraft(Object.fromEntries(Object.keys(EMPTY).map(key=>[key,String(value[key]??'')])) as AuthorDraft);setLoaded(true);
    }).catch(error=>{if(!cancelled)setError(describeReadError(error));});
    return()=>{cancelled=true;};
  },[officeId,month,retry]);
  const update=(key:keyof AuthorDraft,value:string)=>setDraft(previous=>({...previous,[key]:value}));
  return <ViewportModal className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/60 p-4 print:hidden" onKeyDown={event=>{if(event.key==='Escape'&&!saving)onClose();}}><form role="dialog" aria-modal="true" aria-labelledby="implementation-author-title" className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onSubmit={async event=>{
    event.preventDefault();if(!loaded||saving)return;
    const values=[draft.implementationYear,draft.implementationMonth,draft.implementationDay];
    if(values.some(Boolean)){
      const [year,monthValue,day]=values.map(Number),date=new Date(2018+year,monthValue-1,day);
      if(values.some(value=>!/^\d+$/.test(value))||year<1||date.getFullYear()!==2018+year||date.getMonth()!==monthValue-1||date.getDate()!==day){setError('作成日は有効な令和の年・月・日をすべて入力してください。');return;}
    }
    setSaving(true);setError('');
    try{
      const next={...inherited,...draft,officeId,month};
      const batch=writeBatch(monthlySettingsRef(officeId,month).firestore);
      batch.set(monthlySettingsRef(officeId,month),{...next,updatedAt:serverTimestamp()},{merge:true});
      auditDocumentWrite(batch,{officeId,book:'implementation',childId:'',month,label:'事業所共通の作成者・作成日',operation:'設定変更'},inherited,draft);
      await batch.commit();
      if(mounted.current){onSaved(next);onClose();}
    }catch(error){if(mounted.current)setError(describeReadError(error));}finally{if(mounted.current)setSaving(false);}
  }}>
    <h2 id="implementation-author-title" className="shrink-0 border-b px-5 py-4 font-bold text-slate-800">作成者・作成日の設定</h2>
    <div className="min-h-0 space-y-5 overflow-y-auto bg-slate-50 p-5">
      <SettingsGroup title="適用先"><div className={settingsRowClass}><span>事業所</span><span className="text-right text-slate-500">{officeName}</span></div><div className={settingsRowClass}><span>対象月</span><span className="text-slate-500">{month.slice(0,4)}年{Number(month.slice(5))}月分</span></div></SettingsGroup>
      <p className="text-xs leading-relaxed text-slate-500">この事業所・対象月の専門的支援実施計画に共通で使用します。印刷・Excel出力にも反映します。</p>
      {!loaded&&!error&&<p role="status" className="text-sm text-slate-500">設定を読み込み中…</p>}
      <fieldset disabled={!loaded||saving} className="space-y-5 border-0 p-0">
        <SettingsGroup title="作成日・作成者"><div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">{([{key:'implementationYear',label:'令和（年）',min:1},{key:'implementationMonth',label:'月',min:1,max:12},{key:'implementationDay',label:'日',min:1,max:31}] as const).map(field=><label key={field.key} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-slate-700"><span>{field.label}</span><input type="number" aria-label={'作成日の'+field.label} min={field.min} max={'max' in field?field.max:undefined} step={1} value={draft[field.key]} onChange={event=>update(field.key,event.target.value)} className="min-h-10 w-16 rounded-lg bg-slate-50 px-3 text-right outline-emerald-600"/></label>)}<label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700"><span className="shrink-0">作成者</span><input aria-label="専門的支援実施計画の作成者" placeholder="未設定" value={draft.implementationCreator} onChange={event=>update('implementationCreator',event.target.value)} className="min-h-10 min-w-0 flex-1 w-32 rounded-lg bg-slate-50 px-3 text-right outline-emerald-600"/></label></div></SettingsGroup>
      </fieldset>
      {error&&<div role="alert" className="space-y-2 text-sm text-rose-600"><p>{error}</p>{!loaded&&<button type="button" onClick={()=>setRetry(value=>value+1)} className="min-h-10 rounded-xl border px-3">再試行</button>}</div>}
    </div>
    <footer className="flex shrink-0 justify-end gap-3 border-t px-5 py-3"><button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded-xl border px-4 text-sm">キャンセル</button><button type="submit" disabled={!loaded||saving} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{saving?'反映中…':'反映する'}</button></footer>
  </form></ViewportModal>;
}
