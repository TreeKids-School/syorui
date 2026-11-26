import {supportGoalPlan} from './supportGoalPlan';
import {supportGoalText} from './supportGoalText';
import type {ProfessionalPlanDoc} from '../types/professionalPlan';
export type GoalCopyPlan=ProfessionalPlanDoc&{officeId:string};
export type GoalCopyMeta={id?:string;officeId:string;childId:string;month:string;goals?:string};
export function copySupportGoals(plans:GoalCopyPlan[],metas:GoalCopyMeta[],childIds:string[],officeId:string,month:string):Record<string,string>{
  const scoped=plans.filter(plan=>plan.officeId===officeId&&plan.status==='final');
  return Object.fromEntries([...new Set(childIds)].map(id=>{
    const childPlans=scoped.filter(plan=>plan.childId===id);
    const selected=supportGoalPlan(childPlans,id,month);
    const candidates=metas.filter(meta=>meta.officeId===officeId&&meta.childId===id&&meta.month===month);
    const meta=candidates.find(meta=>meta.id===officeId+'_'+id+'_'+month)||candidates[0];
    return [id,supportGoalText(selected,childPlans.length===0?meta?.goals||'':'')];
  }));
}
