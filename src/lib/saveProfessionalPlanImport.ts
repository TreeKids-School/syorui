import {measureRead} from './readDiagnostics';
import {auditDocumentWrite} from './documentAudit';
import {doc,runTransaction,serverTimestamp} from 'firebase/firestore';
import {db} from './firebase';
import type {planImportTargets} from './professionalPlanBulkImport';
/** One file is atomic. Existing records are preserved unless explicitly requested. */
export async function saveProfessionalPlanImport(targets:ReturnType<typeof planImportTargets>,overwrite:boolean){
  if(!targets.length)throw new Error('取り込む書類がありません。');
  if(targets.length>200)throw new Error('1ファイルの対象が200件を超えています。分割して取り込んでください。');
  return runTransaction(db,async transaction=>{
    const refs=targets.map(t=>doc(db,t.collection,t.id));
    const snapshots=await Promise.all(refs.map(ref=>measureRead('個別支援・Excel保存時確認',transaction.get(ref))));
    let saved=0,skipped=0;
    targets.forEach((target,n)=>{
      if(snapshots[n].exists()&&!overwrite){skipped++;return;}
      transaction.set(refs[n],{...target.data,updatedAt:serverTimestamp()},{merge:true});
      auditDocumentWrite(transaction,{officeId:String(target.data.officeId),book:'professional',childId:String(target.data.childId),month:String(target.data.startMonth),documentId:target.id,operation:'Excelインポート'},snapshots[n].exists()?snapshots[n].data():null,target.data);saved++;
    });
    return {saved,skipped};
  });
}
