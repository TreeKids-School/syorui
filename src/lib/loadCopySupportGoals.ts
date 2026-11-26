import {collection,getDocsFromServer,query,where} from 'firebase/firestore';
import {db} from './firebase';
import {measureRead} from './readDiagnostics';
import {copySupportGoals} from './copySupportGoals';
import type {GoalCopyPlan,GoalCopyMeta} from './copySupportGoals';
/** 全児童コピーを押した時だけ、対象事業所の目標をまとめて取得する。 */
export async function loadCopySupportGoals(officeId:string,month:string,childIds:string[]){
  const ids=[...new Set(childIds)];if(!ids.length)return {};
  const snapshot=await measureRead('AIコピー・支援目標',getDocsFromServer(query(collection(db,'professionalPlans'),where('officeId','==',officeId),where('status','==','final'))));
  const plans=snapshot.docs.map(item=>({id:item.id,...item.data()} as GoalCopyPlan));
  let metas:GoalCopyMeta[]=[];
  if(ids.some(id=>!plans.some(plan=>plan.childId===id))){
    const saved=await measureRead('AIコピー・登録済み目標',getDocsFromServer(query(collection(db,'supportPlans'),where('officeId','==',officeId),where('month','==',month))));
    metas=saved.docs.map(item=>({id:item.id,...item.data()} as GoalCopyMeta));
  }
  return copySupportGoals(plans,metas,ids,officeId,month);
}
