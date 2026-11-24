import type {Child} from '../data/mockData';
import type {SupportPrintRow} from './supportImplementationPrint';
import {resolveSupportFuturePlan} from './supportFuturePlans';
type Attendance={officeId:string;isAbsent?:boolean;isWaitlist?:boolean};
/** Only selected-office attendance and explicitly adopted days enter the print snapshot. */
export function summarySupportPrintTargets(children:Child[],selected:Record<string,Set<number>>,reports:Record<string,Record<string,any>>,attendance:Record<string,Record<string,Attendance>>,futures:Record<string,Record<string,string>>,officeId:string,month:string){
  const monthNumber=Number(month.slice(5));
  return [...new Map(children.filter(child=>child.id&&!child.archived).map(child=>[child.id!,child])).values()].flatMap(child=>{
    const rows:SupportPrintRow[]=[...(selected[child.id!]||[])].sort((a,b)=>a-b).flatMap(day=>{
      const date=`${monthNumber}月${day}日`,att=attendance[child.id!]?.[date],report=reports[child.id!]?.[date];
      if(!att||att.officeId!==officeId||att.isAbsent||att.isWaitlist||report?.archived)return [];
      if(day<1||day>new Date(Number(month.slice(0,4)),monthNumber,0).getDate())return [];
      const content=report?.content||{};
      return [{key:child.id+':'+month+'-'+String(day).padStart(2,'0'),date,supportContent:Array.isArray(content.supportContent)?content.supportContent.join('\n'):'',resultInfo:content.resultInfo||'',futurePlan:resolveSupportFuturePlan(content.futurePlan,futures[child.id!]?.[date]),verified:content.isVerified===true}];
    });
    return rows.length?[{child,rows}]:[];
  });
}
