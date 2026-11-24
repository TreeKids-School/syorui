import {collection,doc,serverTimestamp} from 'firebase/firestore';
import {auth,db} from './firebase';
import {auditEntryId,auditScopes,describeDocumentChanges} from './documentAuditModel';
import type {AuditBook,AuditChange} from './documentAuditModel';
let actor={uid:'',name:'',color:'#64748b'};
let childNames=new Map<string,string>();
export function setAuditChildren(children:{id?:string;fullName:string}[]){childNames=new Map(children.filter(child=>child.id).map(child=>[child.id!,child.fullName]));}
export function setAuditActor(uid:string,name:string,color:string){actor={uid,name,color};}
export type AuditContext={officeId:string;book:AuditBook;childId:string;month:string;documentId?:string;label?:string;operation?:string};
/** Append with the document's own batch/transaction. No additional read or clinical text copy. */
export function appendDocumentAudit(writer:{set:(...args:any[])=>unknown},context:AuditContext,changes:AuditChange[]){
  if(!changes.length||!context.officeId)return;
  const uid=auth?.currentUser?.uid||'',identity=actor.uid===uid?actor:null;
  const ref=collection(db,'offices',context.officeId,'document_change_history');
  const id=auditEntryId(Date.now(),doc(ref).id);
  writer.set(doc(ref,id),{...context,childName:childNames.get(context.childId)||'',documentId:context.documentId||'',label:context.label||'',operation:context.operation||'編集',actorUid:uid,actorName:identity?.name||auth?.currentUser?.displayName||'名称未登録',actorColor:identity?.color||'#64748b',createdAt:serverTimestamp(),scopes:auditScopes(context.book,context.childId,context.month),changes});
}
export function auditDocumentWrite(writer:{set:(...args:any[])=>unknown},context:AuditContext,before:any,after:any){appendDocumentAudit(writer,context,describeDocumentChanges(before,after));}
