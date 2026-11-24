import {measureRead,markReadReuse} from './readDiagnostics';
import {collection, documentId, getDocsFromServer, query, where, type QueryDocumentSnapshot, type DocumentData} from 'firebase/firestore';
import {auth, db} from './firebase';

type TreeSnapshot={docs:QueryDocumentSnapshot<DocumentData>[];empty:boolean;forEach:(callback:(doc:QueryDocumentSnapshot<DocumentData>)=>void)=>void};
const pending=new Map<string,Promise<TreeSnapshot>>();

const cached=new Map<string,{expires:number;childId:string;officeId:string;month:string;value:TreeSnapshot}>();
let generation=0;
export function invalidateMonthlyTreeCommunications(officeId:string,month:string,childId?:string){
  generation++;
  for(const [key,value] of cached)if(value.officeId===officeId&&value.month===month&&(!childId||value.childId===childId))cached.delete(key);
  for(const key of pending.keys())if(key.includes(':'+officeId+':'+month+':')&&(!childId||key.includes(':'+childId+':')))pending.delete(key);
}

/** サブコレクション全期間ではなく、対象月の旧形式と事業所付きIDだけ取得する。 */
export function getMonthlyTreeCommunications(childId: string, officeId: string, month: string, dates?: string[]) {
  if (!childId || !officeId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('児童・事業所・対象月を指定してください。');
  const selectedDates = dates === undefined ? undefined : [...new Set(dates)].sort();
  if (selectedDates?.some(date => !date.startsWith(`${month}-`) || !/^\d{4}-\d{2}-(0[1-9]|[12]\d|3[01])$/.test(date))) {
    throw new Error('対象月内の日付を指定してください。');
  }
  const key = `${auth.currentUser?.uid || ''}:${childId}:${officeId}:${month}:${selectedDates?.join(',') ?? 'all'}`;
  for(const [cachedKey,entry] of cached)if(entry.expires<=Date.now())cached.delete(cachedKey);
  const hit=cached.get(key);if(hit&&hit.expires>Date.now()){markReadReuse('ツリー通信');return Promise.resolve(hit.value);}
  if (!pending.has(key)) {
    const startedGeneration=generation;
    const ref = collection(db, 'children', childId, 'app_categories', '書類管理', 'tree_communications');
    const ids = selectedDates?.flatMap(date => [date, `${officeId}_${date}`]);
    // 一覧は出席日・保存済み記録の日だけ取得し、他の日の通信を読まない。
    const requests = ids === undefined
      ? ['', `${officeId}_`].map(prefix => query(ref,
        where(documentId(), '>=', `${prefix}${month}-01`), where(documentId(), '<=', `${prefix}${month}-31`)))
      : Array.from({length: Math.ceil(ids.length / 30)}, (_, index) => query(ref,
        where(documentId(), 'in', ids.slice(index * 30, (index + 1) * 30))));
    const request = Promise.all(requests.map(request => measureRead('ツリー通信',getDocsFromServer(request))))
      .then(snapshots => {
        const docs = [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(doc => [doc.id, doc])).values()];
        const value={docs, empty:docs.length===0,forEach:(callback:(doc:QueryDocumentSnapshot<DocumentData>)=>void)=>docs.forEach(callback)};
        if(startedGeneration===generation)cached.set(key,{expires:Date.now()+30_000,childId,officeId,month,value});
        return value;
      });
    pending.set(key, request);
    const finish=()=>{if(pending.get(key)===request)pending.delete(key);};void request.then(finish,finish);
  }
  return pending.get(key)!;
}
