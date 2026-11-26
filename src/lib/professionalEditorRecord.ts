export function professionalBlankPeriodKey(officeId:string,childId:string,month:string){return JSON.stringify([officeId,childId,month]);}
/** 閲覧だけでは空の書類を作らない。明示的に追加した期間のみ初期書式を開ける。 */
export function professionalEditorRecord<T>(existing:T|undefined,options:{explicitlyAdded:boolean;archived:boolean;existingCount:number},create:()=>T):T|null{
  if(existing)return existing;
  return options.explicitlyAdded&&!options.archived&&options.existingCount===0?create():null;
}
