import type {ProfessionalPlanDoc,ServiceHoursPlan} from '../types/professionalPlan';
import {professionalPlanDraft,professionalVariantId} from './professionalPlanDraft';

export type PeriodCopySource={plans:ProfessionalPlanDoc[];hours:ServiceHoursPlan[]};
/** Copy content into a new period; signatures and old reflection/archive metadata never carry over. */
export function copyProfessionalPeriod(source:PeriodCopySource,childId:string,officeId:string,sourceMonth:string,targetMonth:string,kinds:('final'|'draft'|'hours')[]){
  if(!childId||!officeId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)||sourceMonth===targetMonth)throw new Error('コピー元とは異なる追加先の年月を選択してください。');
  const targets=[];
  for(const kind of new Set(kinds)){
    const matches=(kind==='hours'?source.hours:source.plans).filter(value=>value.childId===childId&&(!(value as {officeId?:string}).officeId||(value as {officeId?:string}).officeId===officeId)&&(value.startMonth||value.createdAt?.slice(0,7))===sourceMonth&&(kind==='hours'||(value as ProfessionalPlanDoc).status===kind));
    if(!matches.length)continue;
    for(const [index,value] of matches.sort((a,b)=>(a.variantIndex||0)-(b.variantIndex||0)).entries()){
    const target=professionalPlanDraft({...value,variantIndex:index},childId,officeId,targetMonth,kind);
    target.id=childId+'_'+targetMonth+(kind==='hours'?'':'_'+kind)+'_'+officeId+professionalVariantId(index);
    target.data.startMonth=targetMonth;target.data.createdAt=targetMonth+'-01';
    target.data.archived=false;target.data.isPrimary=index===0;
    if(kind==='hours')target.data.effectiveStartDate=targetMonth+'-01';
    for(const key of ['archivedAt','archivedBy','reflectedStartMonth','reflectedEndMonth'])delete target.data[key];
    if(kind!=='hours'){target.data.guardianName='';target.data.signDate='';target.data.isReflected=false;}
    targets.push(target);
    }
  }
  if(!targets.length)throw new Error('選択したコピー元に、対象の書類がありません。');
  return targets;
}
