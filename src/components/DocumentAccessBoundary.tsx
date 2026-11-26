import {documentTabSession} from '../lib/documentTabSession';
import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {createPortal} from 'react-dom';
import {doc,onSnapshot,runTransaction} from 'firebase/firestore';
import type {Firestore,Transaction,WriteBatch} from 'firebase/firestore';
import {auth,db} from '../lib/firebase';
import {measureRead} from '../lib/readDiagnostics';
import {describeReadError} from '../lib/readError';
import {createDocumentLeaseStore,DOCUMENT_LEASE_HEARTBEAT,ownsDocumentLease,documentLeasePath} from '../lib/documentLeaseModel';
import type {DocumentLease} from '../lib/documentLeaseModel';
import {guardedWriteBatch} from '../lib/guardedWriteBatch';
import {StaffAccountContext} from './StaffAccountBadge';
import {ViewportModal} from './ViewportModal';
import type {DocumentType} from './DocumentIcon';
import {DocumentIcon} from './DocumentIcon';
import {Loader2,LockKeyhole,X} from 'lucide-react';
type Access={writable:boolean;writeBatch:(database:Firestore)=>WriteBatch;verify:(transaction:Transaction)=>Promise<void>;track:<T>(promise:Promise<T>)=>Promise<T>};
const DocumentAccessContext=createContext<Access|null>(null);
export function useOptionalDocumentAccess(){return useContext(DocumentAccessContext);}
export function useDocumentAccess(){const access=useContext(DocumentAccessContext);if(!access)throw new Error('書類の編集権を確認できません。');return access;}
export function DocumentAccessBoundary({officeId,book,children}:{officeId:string;book:DocumentType;children:ReactNode}){
  const {childId}=useParams();if(!childId||!officeId)return null;
  return <LeaseGate key={officeId+':'+childId+':'+book} officeId={officeId} childId={childId} book={book}>{children}</LeaseGate>;
}
function LeaseGate({officeId,childId,book,children}:{officeId:string;childId:string;book:DocumentType;children:ReactNode}){
  const account=useContext(StaffAccountContext),navigate=useNavigate();
  const identity=useRef<{sessionId:string;uid:string;name:string}>({sessionId:crypto.randomUUID(),uid:auth.currentUser?.uid||'',name:account.name||auth.currentUser?.displayName||'名称未設定'});identity.current.name=account.name||auth.currentUser?.displayName||'名称未設定';
  const ref=useMemo(()=>doc(db,...documentLeasePath(officeId,childId,book)),[officeId,childId,book]);
  const store=useMemo(()=>createDocumentLeaseStore(body=>runTransaction(db,async transaction=>body({read:async()=>{const snapshot=await measureRead('書類の編集権',transaction.get(ref));return snapshot.exists()?snapshot.data() as DocumentLease:null;},write:(value,merge=false)=>{if(merge)transaction.set(ref,value,{merge:true});else transaction.set(ref,value);},remove:()=>transaction.delete(ref)}))),[ref]);
  const observed=useRef<DocumentLease|null>(null),restarting=useRef(false);
  const [watchRetry,setWatchRetry]=useState(0);
  const held=useRef<DocumentLease|null>(null),permitted=useRef(false),pending=useRef(new Set<Promise<unknown>>());
  const [status,setStatus]=useState<'checking'|'held'|'busy'|'paused'>('checking'),[opened,setOpened]=useState(false),[owner,setOwner]=useState<DocumentLease|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState<{id:string;name:string}|null>(null);
  const mounted=useRef(false),attempt=useRef(0),busy=useRef(false),dismissed=useRef(''),renewCurrent=useRef<(()=>Promise<void>)|null>(null);
  const access=useMemo(()=>{
    const track=<T,>(promise:Promise<T>)=>{pending.current.add(promise);void promise.then(()=>pending.current.delete(promise),()=>pending.current.delete(promise));return promise;};
    const verify=async(transaction:Transaction)=>{if(!permitted.current||!held.current)throw new Error('書類の編集権がないため保存を中止しました。画面の入力内容は保持しています。');const snapshot=await measureRead('保存時の編集権確認',transaction.get(ref));const lease=snapshot.exists()?snapshot.data() as DocumentLease:null;if(!ownsDocumentLease(lease,held.current,Date.now())){permitted.current=false;if(mounted.current){setOwner(lease);setStatus('busy');}throw new Error('別の画面が書類を開いたか、編集権の期限が切れたため保存を中止しました。');}};
    return {track,verify,writeBatch:(database:Firestore)=>guardedWriteBatch<Transaction>(body=>runTransaction(database,body),verify,track) as unknown as WriteBatch};
  },[ref]);
  const check=async()=>{
    if(busy.current)return;busy.current=true;const ticket=++attempt.current;setError('');
    try{const sessionId=await documentTabSession();if(!mounted.current||ticket!==attempt.current)return;identity.current.sessionId=sessionId;const result=await access.track(store.acquire(identity.current));if(!mounted.current||ticket!==attempt.current){if(result.status==='held')await store.release(result.owner);return;}
      if(result.status==='held'){held.current=result.owner;permitted.current=true;setOwner(result.owner);setOpened(true);setStatus('held');const latest=ownsDocumentLease(observed.current,result.owner,Date.now())?observed.current:result.owner;const attempted=latest?.notice;setNotice(attempted&&attempted.sessionId!==identity.current.sessionId&&attempted.id!==dismissed.current?{id:attempted.id,name:attempted.name}:null);}
      else{permitted.current=false;setOwner(result.owner);setStatus('busy');}
    }catch(error){if(mounted.current&&ticket===attempt.current){permitted.current=false;setError(describeReadError(error));setStatus('paused');}}finally{if(ticket===attempt.current)busy.current=false;}
  };
  useEffect(()=>{
    restarting.current=false;mounted.current=true;void check();
    const unsubscribe=onSnapshot(ref,snapshot=>{
      if(!mounted.current)return;const lease=snapshot.exists()?snapshot.data() as DocumentLease:null;observed.current=lease;
      if(held.current&&permitted.current){
        if(!ownsDocumentLease(lease,held.current,Date.now())){permitted.current=false;setOwner(lease);setStatus('busy');return;}
        if(lease?.notice&&lease.notice.sessionId!==identity.current.sessionId&&lease.notice.id!==dismissed.current)setNotice({id:lease.notice.id,name:lease.notice.name});
      }else setOwner(lease);
    },error=>{if(mounted.current){permitted.current=false;setError(describeReadError(error));setStatus('paused');}});
    const renew=async()=>{const lease=held.current;if(!lease||!mounted.current||busy.current)return;busy.current=true;try{const result=await access.track(store.renew({...lease,name:identity.current.name}));if(!mounted.current)return;if(result.status==='held'){held.current=result.owner;permitted.current=true;setOwner(result.owner);setStatus('held');setError('');}else{permitted.current=false;setOwner(result.owner);setStatus('busy');}}catch(error){if(mounted.current){permitted.current=false;setError(describeReadError(error));setStatus('paused');}}finally{busy.current=false;}};
    renewCurrent.current=renew;
    const drain=()=>{const lease=held.current;setTimeout(()=>{void (async()=>{while(pending.current.size)await Promise.allSettled([...pending.current]);if(lease)await store.release(lease);})().catch(()=>{});},0);};
    const interval=setInterval(()=>void renew(),DOCUMENT_LEASE_HEARTBEAT);
    const foreground=()=>{if(document.visibilityState==='visible')void renew();};
    const offline=()=>{permitted.current=false;setStatus('paused');setError('接続が切れたため編集を一時停止しています。入力内容はこの画面に保持しています。');};
    window.addEventListener('pagehide',drain);window.addEventListener('focus',foreground);window.addEventListener('online',foreground);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',foreground);
    return()=>{
      renewCurrent.current=null;mounted.current=false;attempt.current++;busy.current=false;unsubscribe();clearInterval(interval);window.removeEventListener('pagehide',drain);window.removeEventListener('focus',foreground);window.removeEventListener('online',foreground);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',foreground);
      if(!restarting.current)drain();
    };
  },[store,ref,access,watchRetry]);
  useEffect(()=>{if(status==='held'&&held.current&&held.current.name!==identity.current.name)void renewCurrent.current?.();},[account.name,status,owner]);
  useEffect(()=>{if(status!=='held'||!held.current)return;const timeout=setTimeout(()=>{permitted.current=false;setStatus('paused');setError('編集権の更新を確認できません。入力内容を保持したまま停止しました。再確認してください。');},Math.max(0,held.current.expiresAt-Date.now()));return()=>clearTimeout(timeout);},[status,owner]);
  const writable=status==='held';
  return <DocumentAccessContext.Provider value={{...access,writable}}>
    {opened&&<div inert={!writable} aria-hidden={!writable||undefined}>{children}</div>}
    {writable&&notice&&createPortal(<aside role="alert" className="fixed inset-x-3 top-3 z-[60000] mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-xl"><LockKeyhole size={19} className="shrink-0"/><p className="flex-1">{notice.name||'名称未設定'}が同じ書類を開いています。この画面で編集を続けられます。</p><button type="button" aria-label="同時閲覧の通知を閉じる" onClick={()=>{dismissed.current=notice.id;setNotice(null);}} className="rounded-xl p-1 hover:bg-amber-100"><X size={18}/></button></aside>,document.body)}
    {!writable&&<ViewportModal className="fixed inset-0 z-[60010] flex items-center justify-center bg-slate-900/50 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="document-access-title" className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"><h2 id="document-access-title" className="flex items-center gap-2 text-lg font-bold"><DocumentIcon type={book}/>{status==='checking'?'書類を確認しています':status==='busy'?'同じ書類が開かれています':'編集を一時停止しています'}</h2>{status==='checking'?<Loader2 size={24} className="animate-spin text-primary"/>:<><p className="text-sm leading-relaxed text-slate-700">{owner&&owner.sessionId!==identity.current.sessionId&&owner.expiresAt>Date.now()?owner.name+'が同じ書類を開いています。':error||'編集権を確認してから書類を開きます。'}{opened?'入力内容はこの画面に保持しています。':'この画面では書類を開いていません。'}</p>{error&&owner&&<p role="alert" className="text-sm text-rose-600">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={()=>navigate('/monthly-summary')} className="min-h-10 rounded-xl border px-3 text-sm">一覧に戻る</button><button type="button" onClick={()=>{restarting.current=true;permitted.current=false;setStatus('checking');setWatchRetry(value=>value+1);}} className="min-h-10 rounded-xl bg-primary px-4 text-sm text-white">再確認</button></div></>}</section></ViewportModal>}
  </DocumentAccessContext.Provider>;
}
