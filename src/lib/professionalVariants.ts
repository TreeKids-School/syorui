import type {Transaction} from 'firebase/firestore';
import {auditDocumentWrite} from './documentAudit';
import {doc,runTransaction,serverTimestamp} from 'firebase/firestore';
import {db} from './firebase';

type Variant={variantIndex?:number;isPrimary?:boolean;archived?:boolean};
export function primaryVariantIndex(records:Variant[]):number{
  return records.slice().sort((a,b)=>Number(b.isPrimary===true)-Number(a.isPrimary===true)||(a.variantIndex||0)-(b.variantIndex||0))[0]?.variantIndex||0;
}
export function professionalMonthAvailability(records:(Variant&{startMonth?:string;createdAt?:string})[]){
  const active=new Set<string>(),archived=new Set<string>();
  for(const record of records){const month=record.startMonth||record.createdAt?.slice(0,7);if(!month||!/^\d{4}-\d{2}$/.test(month))continue;(record.archived?archived:active).add(month);}
  const months=[...new Set([...active,...archived])].sort();
  return {months,archivedMonths:[...archived],archiveMap:Object.fromEntries(months.map(month=>[month,!active.has(month)&&archived.has(month)]))};
}
export type ProfessionalRecordRef={collection:string;id:string};
export async function saveProfessionalPrimary(records:ProfessionalRecordRef[],selectedId:string,verify?:(transaction:Transaction)=>Promise<void>){
  if(!records.some(record=>record.id===selectedId))throw new Error('メインにする書類が見つかりません。');
  await runTransaction(db,async transaction=>{
    await verify?.(transaction);
    const refs=records.map(record=>doc(db,record.collection,record.id));
    const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
    const index=records.findIndex(record=>record.id===selectedId);
    if(!snapshots[index].exists()||snapshots[index].data()?.archived)throw new Error('アーカイブされている書類はメインにできません。');
    records.forEach((record,i)=>{if(snapshots[i].exists()){const before=snapshots[i].data()!,after={isPrimary:record.id===selectedId};transaction.set(refs[i],{...after,updatedAt:serverTimestamp()},{merge:true});auditDocumentWrite(transaction,{officeId:before.officeId,book:'professional',childId:before.childId,month:before.startMonth||before.createdAt?.slice(0,7)||'',documentId:record.id,operation:'メイン指定'},before,{...before,...after});}});
  });
}
export async function archiveProfessionalVariants(records:ProfessionalRecordRef[],archived:boolean,verify?:(transaction:Transaction)=>Promise<void>){
  if(!records.length)throw new Error('対象の書類を選択してください。');
  await runTransaction(db,async transaction=>{
    await verify?.(transaction);
    const refs=records.map(record=>doc(db,record.collection,record.id));
    const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
    records.forEach((record,i)=>{if(snapshots[i].exists()){const before=snapshots[i].data()!,after={archived,...(archived?{isPrimary:false}:{})};transaction.set(refs[i],{...after,updatedAt:serverTimestamp()},{merge:true});auditDocumentWrite(transaction,{officeId:before.officeId,book:'professional',childId:before.childId,month:before.startMonth||before.createdAt?.slice(0,7)||'',documentId:record.id,operation:archived?'アーカイブ':'アーカイブ解除'},before,{...before,...after});}});
  });
}
