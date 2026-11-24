import {useEffect,useState} from 'react';
import {collection,doc,getDoc,getDocs,query,where} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {getMonthlySettings} from '../lib/monthlySettings';
import {supportGoalPlan} from '../lib/supportGoalPlan';
import {supportGoalText} from '../lib/supportGoalText';
import {excelExportOfficePriority} from '../lib/excelExportOfficeScope';
import {describeReadError} from '../lib/readError';
import type {Child} from '../data/mockData';
import type {ProfessionalPlanDoc} from '../types/professionalPlan';
import type {SupportPrintBatchDocument,SupportPrintRow} from '../lib/supportImplementationPrint';
import {SupportImplementationPrintSettings} from './SupportImplementationPrintSettings';
import {ViewportModal} from './ViewportModal';

export type BatchSupportPrintTarget={child:Child;rows:SupportPrintRow[]};
/** Daily text comes from the loaded summary snapshot. Goals are read only on explicit print request. */
export function BatchSupportPrint({targets,officeId,officeName,month,creator,onClose}:{targets:BatchSupportPrintTarget[];officeId:string;officeName:string;month:string;creator:string;onClose:()=>void}){
  const [documents,setDocuments]=useState<SupportPrintBatchDocument[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let cancelled=false;setError('');setDocuments(null);
    (async()=>{
      if(!officeId||!targets.length)throw new Error('採用日が選ばれている児童がいません。');
      const ids=targets.map(target=>target.child.id!);
      const chunks=Array.from({length:Math.ceil(ids.length/30)},(_,i)=>ids.slice(i*30,i*30+30));
      const [settings,planGroups,metas]=await Promise.all([
        getMonthlySettings(officeId,month),
        Promise.all(chunks.map(chunk=>getDocs(query(collection(db,'professionalPlans'),where('childId','in',chunk),where('officeId','==',officeId),where('status','==','final'))))),
        Promise.all(targets.map(async({child})=>{
          for(const id of [`${officeId}_${child.id}_${month}`,`${child.id}_${month}`]){
            const snapshot=await getDoc(doc(db,'supportPlans',id));
            if(snapshot.exists()&&excelExportOfficePriority(snapshot.data(),id,child,officeId,month))return snapshot.data();
          }
          return {};
        })),
      ]);
      const plans=planGroups.flatMap(group=>group.docs.map(item=>({id:item.id,...item.data()} as ProfessionalPlanDoc)));
      const config=settings.exists()?settings.data():{};
      const result=targets.map(({child,rows},index)=>{
        const ownPlans=plans.filter(plan=>plan.childId===child.id),meta=metas[index];
        const rawDate=meta.createdAt?.toDate?.()||meta.createdAt;
        const date=rawDate?new Date(rawDate):new Date();
        const createdDate=config.implementationYear&&config.implementationMonth&&config.implementationDay
          ?`令和${config.implementationYear}年${config.implementationMonth}月${config.implementationDay}日作成`
          :Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('ja-JP-u-ca-japanese',{era:'long',year:'numeric',month:'long',day:'numeric'}).format(date)+'作成';
        return {key:child.id!,rows,documentData:{childName:child.fullName,officeName,month,
          goals:supportGoalText(supportGoalPlan(ownPlans,child.id!,month),ownPlans.length?'':meta.goals||''),
          creator:config.implementationCreator||creator,createdDate}};
      });
      if(!cancelled)setDocuments(result);
    })().catch(error=>{if(!cancelled)setError(describeReadError(error));});
    return()=>{cancelled=true;};
  },[targets,officeId,officeName,month,creator,retry]);
  if(documents)return <SupportImplementationPrintSettings batchDocuments={documents} onClose={onClose}/>;
  return <ViewportModal className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/60 p-4"><section role="dialog" aria-modal="true" aria-label="専門的支援実施計画の一括印刷を準備" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><h2 className="font-bold">専門的支援実施計画の一括印刷</h2>{error?<p role="alert" className="text-sm text-rose-600">{error}</p>:<p role="status" className="text-sm text-slate-600">{targets.length}名分の印刷プレビューを準備しています…</p>}<div className="flex justify-end gap-3">{error&&<button type="button" onClick={()=>setRetry(value=>value+1)} className="min-h-10 rounded-xl border px-4 text-sm">再試行</button>}<button type="button" onClick={onClose} className="min-h-10 rounded-xl border px-4 text-sm">戻る</button></div></section></ViewportModal>;
}
