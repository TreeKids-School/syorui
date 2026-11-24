import {collection,documentId,getDocs,limit,orderBy,query,startAfter} from 'firebase/firestore';
import {where} from 'firebase/firestore';
import type {DocumentData,QueryDocumentSnapshot,QuerySnapshot} from 'firebase/firestore';
import {auth,db} from './firebase';
import {measureRead,markReadReuse} from './readDiagnostics';
const pending=new Map<string,Promise<QuerySnapshot<DocumentData>>>();
export function readAuditPage(officeId:string,scope:string,after:QueryDocumentSnapshot<DocumentData>|null){
  const key=[auth.currentUser?.uid||'',officeId,scope,after?.id||''].join(':');
  if(pending.has(key)){markReadReuse('変更ログ');return pending.get(key)!;}
  const request=measureRead('変更ログ',getDocs(query(collection(db,'offices',officeId,'document_change_history'),where('scopes','array-contains',scope),orderBy(documentId(),'asc'),...(after?[startAfter(after)]:[]),limit(50))));
  pending.set(key,request);const clear=()=>{if(pending.get(key)===request)pending.delete(key);};void request.then(clear,clear);return request;
}
