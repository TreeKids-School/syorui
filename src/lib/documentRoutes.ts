import type {DocumentType} from '../components/DocumentIcon';
import {japanDateKey} from './summaryChildOrder';
export function documentRoute(type:DocumentType,childId:string,month:string){
  if(type==='professional')return '/children/'+childId+'/professional-perspective';
  if(type==='force')return '/children/'+childId+'/force-sheet';
  return '/children/'+childId+'/support-plan/'+month;
}
export function implementationNavigationMonth(from:DocumentType,displayedMonth:string,date=new Date()){
  return from==='implementation'?displayedMonth:japanDateKey(date).slice(0,7);
}
