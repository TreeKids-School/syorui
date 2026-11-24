import type {ProfessionalPlanDoc} from '../types/professionalPlan';
export function supportGoalPlanMonth(plan:ProfessionalPlanDoc):string {
  return plan.startMonth || plan.createdAt?.slice(0,7) || '';
}
export function hasSupportGoals(plan:ProfessionalPlanDoc):boolean {
  return [plan.longTermGoal,plan.shortTermGoal,...(plan.supportRows||[]).map(row=>row.supportGoal)]
    .some(value=>typeof value==='string' && value.trim().length>0);
}
function monthIndex(month:string):number {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return NaN;
  const [year,value]=month.split('-').map(Number);
  return year*12+value-1;
}
export function supportGoalPlan(plans:ProfessionalPlanDoc[],childId:string,month:string):ProfessionalPlanDoc|null {
  return plans.filter(p=>p.childId===childId && p.status==='final' && !p.archived && hasSupportGoals(p) && monthIndex(month)-monthIndex(supportGoalPlanMonth(p))>=0 && monthIndex(month)-monthIndex(supportGoalPlanMonth(p))<6)
    .sort((a,b)=>supportGoalPlanMonth(b).localeCompare(supportGoalPlanMonth(a)) || Number(b.isPrimary===true)-Number(a.isPrimary===true) || (a.variantIndex||0)-(b.variantIndex||0) || (b.createdAt||'').localeCompare(a.createdAt||''))[0] || null;
}
