import {auditDocumentWrite} from './documentAudit';
import {japanDateKey} from './summaryChildOrder';
import {doc,getDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import {db} from './firebase';

export const cleanProfessionalManagerName=(value:unknown)=>String(value||'').trim().replace(/(?:[\s　]*(?:印|㊞))+$/u,'').trim();
const cached=new Map<string,Promise<string>>();
export function getProfessionalManager(officeId:string,refresh=false):Promise<string>{
  if(!officeId)return Promise.resolve('');
  if(refresh)cached.delete(officeId);
  if(!cached.has(officeId))cached.set(officeId,getDoc(doc(db,'office_document_settings',officeId)).then(snapshot=>cleanProfessionalManagerName(snapshot.data()?.professionalManagerName)).catch(error=>{cached.delete(officeId);throw error;}));
  return cached.get(officeId)!;
}
export async function saveProfessionalManager(officeId:string,name:string){
  if(!officeId)throw new Error('事業所を選択してください。');
  const clean=cleanProfessionalManagerName(name);
  const previous=await cached.get(officeId)?.catch(()=>undefined),batch=writeBatch(db);
  batch.set(doc(db,'office_document_settings',officeId),{professionalManagerName:clean,updatedAt:serverTimestamp()},{merge:true});
  auditDocumentWrite(batch,{officeId,book:'professional',childId:'',month:japanDateKey().slice(0,7),label:'事業所共通の管理責任者氏名',operation:'設定変更'},{professionalManagerName:previous},{professionalManagerName:clean});
  await batch.commit();
  cached.set(officeId,Promise.resolve(clean));
  return clean;
}
