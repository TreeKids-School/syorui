export const SUMMARY_COUNT_ROWS=['出席日数','必要日数','個別療育','集団療育'] as const;
export type SummaryCountRow=typeof SUMMARY_COUNT_ROWS[number];
export function normalizeHiddenCountRows(value:unknown):string[]{
  if(!Array.isArray(value))return [];
  return [...new Set(value.map(label=>label==='個別以外'?'集団療育':label).filter((label):label is SummaryCountRow=>typeof label==='string'&&(SUMMARY_COUNT_ROWS as readonly string[]).includes(label)))];
}
export function summaryCountValue(label:SummaryCountRow,stat:{attendanceCount:number;requiredDays:number;individualCount:number}|null|undefined){
  if(!stat)return 0;
  return label==='出席日数'?stat.attendanceCount:label==='必要日数'?stat.requiredDays:label==='個別療育'?stat.individualCount:Math.max(0,stat.attendanceCount-stat.individualCount);
}

export function filterZeroAttendanceChildren<T extends {id?:string}>(children:T[],stats:Record<string,{attendanceCount:number}>,hideZero:boolean):T[]{
  return hideZero?children.filter(child=>(stats[child.id||'']?.attendanceCount??0)>0):children;
}
