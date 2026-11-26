import type {DailyReport} from '../types/supportPlan';
import {supportDateKey} from './supportOfficeAttendance';
export function updateSupportRowContent(rows:DailyReport[],target:Pick<DailyReport,'localKey'|'date'>,field:keyof DailyReport['content'],value:any):DailyReport[]{
  if(!target.localKey)return rows;
  return rows.map(row=>row.localKey===target.localKey&&row.date===target.date?{...row,content:{...row.content,[field]:value}}:row);
}
/** 行の位置から日付を推測せず、同じ日付の不足項目だけを補完する。 */
export function syncSupportRowsByDate(rows:DailyReport[],month:string,newsletters:Record<string,string>,futurePlans:Record<string,string>):DailyReport[]{
  return rows.map(row=>{const date=supportDateKey(row.date,month);if(!date)return row;
    return {...row,date,content:{...row.content,externalInfo:row.content.externalInfo?.trim()?row.content.externalInfo:newsletters[date]||'',futurePlan:row.content.futurePlan?.trim()?row.content.futurePlan:futurePlans[date]||''}};
  });
}
