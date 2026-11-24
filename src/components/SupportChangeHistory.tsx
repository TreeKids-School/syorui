import {ViewportModal} from './ViewportModal';
import {useEffect, useRef, useState} from 'react';
import {collection, getDocsFromServer, limit, orderBy, query, startAfter} from 'firebase/firestore';
import type {DocumentData, QueryDocumentSnapshot} from 'firebase/firestore';
import {X} from 'lucide-react';
import {db} from '../lib/firebase';
import {describeReadError} from '../lib/readError';
import type {SupportChange} from '../lib/supportChangeHistory';

export function SupportChangeHistory({officeId, childId, month, onClose}: {officeId: string; childId: string; month: string; onClose: () => void}) {
  const [entries, setEntries] = useState<{id: string; actorName: string; actorColor?: string; createdAt: any; changes: SupportChange[]}[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const load = async (after?: QueryDocumentSnapshot<DocumentData> | null) => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true); setError('');
    try {
      const ref = collection(db, 'offices', officeId, 'support_change_history', `${childId}_${month}`, 'entries');
      const snapshot = await getDocsFromServer(query(ref, orderBy('createdAt','desc'), ...(after ? [startAfter(after)] : []), limit(50)));
      const next = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})) as typeof entries;
      setEntries(previous => after ? [...previous, ...next] : next);
      setCursor(snapshot.docs.at(-1) || null); setMore(snapshot.size === 50);
    } catch (error) {setError(describeReadError(error));} finally {pending.current = false; setLoading(false);}
  };
  useEffect(() => {void load();}, [officeId, childId, month]);
  const time = (value: any) => {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date) : '時刻確定中';
  };
  return <ViewportModal className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/50 p-3 print:hidden" onKeyDown={event => {if(event.key==='Escape')onClose();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="support-history-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id="support-history-title" className="font-bold">変更履歴（{month.replace('-','年')}月）</h2><button autoFocus type="button" aria-label="変更履歴を閉じる" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header>
      <div className="overflow-auto p-4">
        {error && <p role="alert" className="mb-3 text-sm text-rose-600">{error}<button type="button" onClick={() => void load(cursor)} className="ml-2 underline">再試行</button></p>}
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="whitespace-nowrap px-3 py-2">日時</th><th className="whitespace-nowrap px-3 py-2">変更者</th><th className="px-3 py-2">変更した場所</th></tr></thead><tbody>
          {entries.map(entry => <tr key={entry.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-3 align-top text-xs">{time(entry.createdAt)}</td><td className="px-3 py-3 align-top"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{backgroundColor:entry.actorColor||'#64748b'}}/>{entry.actorName||'名称未登録'}</td><td className="space-y-1 px-3 py-3">{(entry.changes||[]).map((change,index)=><div key={index}>{change.date ? `${change.date}・` : ''}{change.field}（{change.action}）</div>)}</td></tr>)}
        </tbody></table>
        {!loading&&!entries.length&&!error&&<p className="py-8 text-center text-sm text-slate-500">変更履歴はまだありません。</p>}
        {loading&&<p role="status" className="py-4 text-center text-sm text-slate-500">読み込み中…</p>}
        {more&&!loading&&<button type="button" onClick={()=>void load(cursor)} className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600">さらに表示</button>}
      </div>
    </section>
  </ViewportModal>;
}
