import {collection,getDocsFromServer,query,where} from 'firebase/firestore';
import {auth,db} from './firebase';
import {measureRead,markReadReuse} from './readDiagnostics';
type MonitoringPlan={id:string;childId:string;officeId:string;startMonth:string;createdAt?:string;archived:boolean;isPrimary?:boolean;variantIndex?:number};
const cached=new Map<string,{expires:number;request:Promise<MonitoringPlan[]>}>();
export function getMonitoringPlans(officeId:string,refresh=false){
  const key=(auth.currentUser?.uid||'')+':'+officeId;
  if(refresh)cached.delete(key);
  const previous=cached.get(key);if(previous&&previous.expires>Date.now()){markReadReuse('通知用の本案');return previous.request;}
  const request=measureRead('通知用の本案',getDocsFromServer(query(collection(db,'professionalPlans'),where('officeId','==',officeId),where('status','==','final')))).then(snapshot=>snapshot.docs.map(item=>{const value=item.data();return {id:item.id,childId:value.childId,officeId:value.officeId,startMonth:value.startMonth||value.createdAt?.slice?.(0,7)||'',createdAt:typeof value.createdAt==='string'?value.createdAt:undefined,isPrimary:value.isPrimary===true,variantIndex:value.variantIndex,archived:value.archived===true};}));
  cached.set(key,{expires:Date.now()+120_000,request});void request.catch(()=>{if(cached.get(key)?.request===request)cached.delete(key);});return request;
}

/** 保存済みの期限情報だけを共有し、タスク表示のために全本案を再読込しない。 */
export function patchMonitoringPlan(plan:MonitoringPlan){
  const key=(auth.currentUser?.uid||'')+':'+plan.officeId,entry=cached.get(key);if(!entry)return;
  const request=entry.request.then(previous=>[...previous.filter(value=>value.id!==plan.id),plan]);entry.request=request;void request.catch(()=>{if(cached.get(key)?.request===request)cached.delete(key);});
}
