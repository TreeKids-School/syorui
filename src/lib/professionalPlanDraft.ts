export function professionalVariantSuffix(index:number|undefined){return index&&index>0?'（'+index+'）':'';}
export function professionalVariantId(index:number|undefined){return index&&index>0?'__variant_'+index:'';}
import type {ProfessionalPlanDoc,ServiceHoursPlan} from '../types/professionalPlan';
export type ProfessionalDraft={collection:string;id:string;data:Record<string,unknown>};
export function professionalPlanDraft(value:ProfessionalPlanDoc|ServiceHoursPlan,childId:string,officeId:string,month:string,tab:'final'|'draft'|'hours'):ProfessionalDraft {
  const startMonth=value.startMonth||month;
  const data:Record<string,unknown>={...value,childId,officeId,startMonth};delete data.id;delete data.updatedAt;
  if(tab!=='hours')data.status=tab;
  return {collection:tab==='hours'?'serviceHoursPlans':'professionalPlans',id:childId+'_'+startMonth+(tab==='hours'?'':'_'+tab)+'_'+officeId+professionalVariantId(value.variantIndex),data};
}
