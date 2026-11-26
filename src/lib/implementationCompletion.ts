export function implementationCompletionPath(officeId:string,month:string){
  if(!officeId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('完了状態の事業所・対象月が不正です。');
  return ['offices',officeId,'monthly_implementation_completion',month] as const;
}
export function completedImplementationChildren(data:any):Set<string>{
  const flags=data?.completed;if(!flags||typeof flags!=='object'||Array.isArray(flags))return new Set();
  return new Set(Object.entries(flags).filter(([,value])=>value===true).map(([id])=>id));
}
