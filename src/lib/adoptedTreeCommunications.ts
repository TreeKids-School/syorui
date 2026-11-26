import {supportDateKey} from './supportOfficeAttendance';
type Row={date:any;archived?:boolean;content?:{externalInfo?:string;resultInfo?:string}};
/** コピー対象は採用日から決め、元の通信が存在するだけの日は対象に戻さない。 */
export function adoptedTreeCommunications(month:string,rows:Row[],sources:Record<string,string>,attendance: Set<string>,adoptedDates?:Set<string>,onlyMissingResults=false){
  const byDate=new Map<string,Row[]>();
  for(const row of rows){const date=supportDateKey(row.date,month);if(!date)continue;const group=byDate.get(date)||[];group.push(row);byDate.set(date,group);}
  const candidates=adoptedDates||new Set([...byDate].filter(([,group])=>group.some(row=>row.archived!==true)).map(([date])=>date));
  const output:{date:string;text:string}[]=[];
  for(const rawDate of candidates){const date=supportDateKey(rawDate,month);if(!date||!attendance.has(date))continue;
    const active=(byDate.get(date)||[]).filter(row=>row.archived!==true);
    if(onlyMissingResults&&active.some(row=>row.content?.resultInfo?.trim()))continue;
    const text=active.map(row=>row.content?.externalInfo?.trim()||'').find(Boolean)||sources[date]?.trim()||'';
    if(text)output.push({date,text});
  }
  return output.sort((a,b)=>Number(a.date.match(/月(\d+)日/)![1])-Number(b.date.match(/月(\d+)日/)![1]));
}
