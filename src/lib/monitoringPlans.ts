import {collection,getDocsFromServer,query,where} from 'firebase/firestore';
import {auth,db} from './firebase';
import {measureRead,markReadReuse} from './readDiagnostics';
type MonitoringPlan={id:string;childId:string;officeId:string;startMonth:string;archived:boolean};
const cached=new Map<string,{expires:number;request:Promise<MonitoringPlan[]>}>();
export function getMonitoringPlans(officeId:string,refresh=false){
  const key=(auth.currentUser?.uid||'')+':'+officeId;
  if(refresh)cached.delete(key);
  const previous=cached.get(key);if(previous&&previous.expires>Date.now()){markReadReuse('通知用の本案');return previous.request;}
  const request=measureRead('通知用の本案',getDocsFromServer(query(collection(db,'professionalPlans'),where('officeId','==',officeId),where('status','==','final')))).then(snapshot=>snapshot.docs.map(item=>{const value=item.data();return {id:item.id,childId:value.childId,officeId:value.officeId,startMonth:value.startMonth||value.createdAt?.slice?.(0,7)||'',archived:value.archived===true};}));
  cached.set(key,{expires:Date.now()+120_000,request});void request.catch(()=>{if(cached.get(key)?.request===request)cached.delete(key);});return request;
}
