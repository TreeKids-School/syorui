import {documentRoute} from './documentRoutes';
import type {AuditBook} from './documentAuditModel';
type Target={book:AuditBook;childId:string;month:string;documentId?:string;label?:string;operation?:string};
export function auditDocumentRoute(entry:Target):string|null{
  if(!entry.childId)return null;
  const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month)?entry.month:'';
  if(entry.book==='implementation')return month?documentRoute(entry.book,entry.childId,month):null;
  const params=new URLSearchParams();
  if(entry.book==='professional'){
    if(month)params.set('logMonth',month);
    if(entry.documentId)params.set('logDocument',entry.documentId);
    const kind=entry.label==='利用時間'?'hours':entry.label==='案'||entry.documentId?.includes('_draft_')?'draft':entry.documentId&&!entry.documentId.includes('_final_')&&!entry.documentId.includes('_draft_')?'hours':'final';
    params.set('logKind',kind);
  }else{
    const date=entry.documentId?.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];if(date)params.set('date',date);
  }
  return documentRoute(entry.book,entry.childId,month)+(params.size?'?'+params.toString():'');
}
