import {useState} from 'react';
import {AlertTriangle,Check,Clipboard,ExternalLink} from 'lucide-react';
import {buildTreeCommunicationCopy} from '../lib/treeCommunicationCopy';

export function ResultWorkflowTools({month,multiple=false,onGetSource}:{month:string;multiple?:boolean;onGetSource:()=>string|Promise<string>}){
  const [notice,setNotice]=useState(false),[copied,setCopied]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const copy=async()=>{
    if(busy)return;setBusy(true);setError('');setCopied('');
    try{const text=await onGetSource();if(!text.trim())throw new Error('コピー対象のツリー通信がありません。');await navigator.clipboard.writeText(buildTreeCommunicationCopy(month,text,multiple));setCopied('source');}catch(error){setError(error instanceof Error?error.message:'コピーできませんでした。');}finally{setBusy(false);}
  };
  const button='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50';
  return <section className="space-y-3" aria-label="療育結果の作成手順">
    <div className="flex justify-end"><button type="button" aria-expanded={notice} onClick={()=>setNotice(value=>!value)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100"><AlertTriangle size={14}/>注意事項</button></div>
    {notice&&<div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><AlertTriangle size={18} className="shrink-0 text-amber-600"/><div><p className="font-bold">個人情報の取り扱いについて</p><p className="mt-1">{multiple?'本機能では児童の実名を使用せず、コピー時のID情報を用いて一括登録します。AIが出力したID表記（■ 児童 (ID: xxxxx)）は変更せずにそのまま貼り付けてください。':'外部のAIへ送る文章やAIが出力する文章に児童の個人名を含めないようにしてください。本機能では日付情報を用いて一括登録します。'}</p></div></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><h4 className="text-sm font-semibold text-slate-700">1. ツリー通信をコピー</h4><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void copy()} className={button}>{copied==='source'?<Check size={17}/>:<Clipboard size={17}/>}ツリー通信をコピー</button><a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" className={button}><ExternalLink size={17}/>Geminiを開く</a></div></div>
    {copied&&<p role="status" className="text-xs text-primary">指示文とツリー通信をコピーしました。</p>}{error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
  </section>;
}
