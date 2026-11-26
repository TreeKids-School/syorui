import type {Transaction} from 'firebase/firestore';
import {measureReads,measureRead} from './readDiagnostics';
import {auditDocumentWrite} from './documentAudit';
import {invalidateMonthlyTreeCommunications} from './monthlyTreeCommunications';
import {getProfessionalManager,cleanProfessionalManagerName} from './professionalManager';
import * as XLSX from 'xlsx';
import {collection,doc,getDoc as firestoregetDoc,getDocs as firestoregetDocs,query,where,runTransaction,serverTimestamp} from 'firebase/firestore';
const getDocs=measureReads('CSV／JSON入出力',firestoregetDocs);
const getDoc=measureReads('CSV／JSON入出力',firestoregetDoc);

import {db} from './firebase';
import {excelExportOfficePriority} from './excelExportOfficeScope';
import {cleanTransferData,transferBook,parseTransfer,TRANSFER_FIELDS} from './documentTransferFormat';
import type {TransferBook,TransferKind,TransferRecord} from './documentTransferFormat';
import type {Child} from '../data/mockData';
export type TransferScope={book:TransferBook;officeId:string;month:string;children:Child[];childId?:string};
export type TransferPreview={record:TransferRecord;exists:boolean;error:string};
const monthOf=(kind:TransferKind,data:Record<string,any>)=>kind==='daily_reports'?data.planMonth:kind==='supportPlans'?data.month:data.startMonth||data.createdAt?.slice?.(0,7)||'';
export const scopeChildren=(scope:TransferScope)=>scope.children.filter(child=>child.id&&!child.archived&&(!scope.childId||child.id===scope.childId));
export function transferDestination(record:TransferRecord):TransferRecord{
  if(record.kind==='daily_reports')return record;
  const suffix=record.data.variantIndex?'__variant_'+record.data.variantIndex:'';
  const id=record.kind==='supportPlans'?record.officeId+'_'+record.childId+'_'+record.month:record.childId+'_'+record.month+(record.kind==='professionalPlans'?'_'+record.data.status:'')+'_'+record.officeId+suffix;
  return {...record,id};
}
export function transferScopeError(record:TransferRecord,scope:TransferScope):string{
  if(transferBook(record.kind)!==scope.book)return '別の種類の書類です';
  if(record.officeId!==scope.officeId)return '別の事業所です';
  if(record.month!==scope.month)return '対象月が異なります';
  const child=scopeChildren(scope).find(child=>child.id===record.childId);if(!child)return '対象の児童が見つかりません';
  if(record.kind==='daily_reports'){
    const value=record.data.date,match=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if(!match||value.slice(0,7)!==scope.month||new Date(Number(match[1]),Number(match[2])-1,Number(match[3])).getDate()!==Number(match[3]))return '記録日が対象月内の有効な日付ではありません';
  }
  if(record.kind==='serviceHoursPlans'&&record.data.effectiveStartDate){
    const value=record.data.effectiveStartDate,match=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match||value.slice(0,7)!==scope.month||new Date(Number(match[1]),Number(match[2])-1,Number(match[3])).getDate()!==Number(match[3]))return '利用開始日が対象月内の有効な日付ではありません';
  }
  return '';
}
export async function exportTransferRecords(scope:TransferScope):Promise<TransferRecord[]>{
  if(!scope.officeId)throw new Error('事業所を選択してください。');
  const children=scopeChildren(scope),byId=new Map(children.map(child=>[child.id!,child]));
  const kinds:TransferKind[]=scope.book==='implementation'?['supportPlans','daily_reports']:['professionalPlans','serviceHoursPlans'];
  const groups=await Promise.all(kinds.map(async kind=>{
    const constraints=kind==='supportPlans'?[where('month','==',scope.month)]:[where('officeId','==',scope.officeId),...(kind==='daily_reports'?[where('planMonth','==',scope.month)]:[])];
    if(scope.childId)constraints.push(where('childId','==',scope.childId));
    const snapshot=await getDocs(query(collection(db,kind),...constraints));
    return snapshot.docs.flatMap(item=>{
      const data=item.data(),child=byId.get(data.childId);if(!child||monthOf(kind,data)!==scope.month)return [];
      if(!excelExportOfficePriority({...data,month:undefined,planMonth:undefined},item.id,child,scope.officeId,scope.month))return [];
      return [{kind,id:item.id,childId:child.id!,childName:child.fullName,officeId:scope.officeId,month:scope.month,data:cleanTransferData(kind,data)}];
    });
  }));
  const records=groups.flat();
  if(records.some(record=>record.kind==='professionalPlans'&&!cleanProfessionalManagerName(record.data.managerName))){
    const manager=await getProfessionalManager(scope.officeId);
    for(const record of records)if(record.kind==='professionalPlans')record.data.managerName=cleanProfessionalManagerName(record.data.managerName)||manager;
  }
  return records.sort((a,b)=>a.childName.localeCompare(b.childName,'ja')||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
}
export async function previewTransfer(input:TransferRecord[],scope:TransferScope):Promise<TransferPreview[]>{
  const records=input.map(transferDestination);
  const seen=new Set<string>(),result:TransferPreview[]=[];
  for(let start=0;start<records.length;start+=30){
    result.push(...await Promise.all(records.slice(start,start+30).map(async record=>{
      let error=transferScopeError(record,scope),exists=false;const key=record.kind+'/'+record.id;
      if(seen.has(key))error='同じ書類IDがファイル内で重複しています';seen.add(key);
      if(!error){const snapshot=await getDoc(doc(db,record.kind,record.id));exists=snapshot.exists();
        if(exists){const data=snapshot.data()!,child=scopeChildren(scope).find(child=>child.id===record.childId)!;
          if(data.childId!==record.childId||monthOf(record.kind,data)!==record.month||!excelExportOfficePriority({...data,month:undefined,planMonth:undefined},record.id,child,scope.officeId,scope.month))error='同じIDの別の児童・事業所・月の記録が存在します';
        }
      }
      return {record,exists,error};
    })));
  }
  return result;
}
export async function importTransferRecords(input:TransferRecord[],scope:TransferScope,overwrite:boolean,onProgress?:(saved:number,skipped:number)=>void,verify?:(transaction:Transaction)=>Promise<void>){
  const records=input.map(transferDestination);
  if(!records.length)throw new Error('取り込むデータがありません。');
  for(const record of records){const error=transferScopeError(record,scope);if(error)throw new Error(error);}
  let saved=0,skipped=0;
  for(let index=0;index<records.length;index+=200){
    const group=records.slice(index,index+200);
    const result=await runTransaction(db,async transaction=>{
      await verify?.(transaction);
      const refs=group.map(record=>doc(db,record.kind,record.id)),snapshots=await Promise.all(refs.map(ref=>measureRead('CSV／JSON保存時の確認',transaction.get(ref))));
      let saved=0,skipped=0;
      group.forEach((record,n)=>{
        const snapshot=snapshots[n];
        if(snapshot.exists()){
          const existing=snapshot.data(),child=scopeChildren(scope).find(child=>child.id===record.childId)!;
          if(existing.childId!==record.childId||monthOf(record.kind,existing)!==record.month||!excelExportOfficePriority({...existing,month:undefined,planMonth:undefined},record.id,child,scope.officeId,scope.month))throw new Error('保存先の児童・事業所・月が変わりました。再確認してください。');
          if(!overwrite){skipped++;return;}
        }
        const data={...cleanTransferData(record.kind,record.data),childId:record.childId,officeId:scope.officeId,updatedAt:serverTimestamp()} as Record<string,any>;
        if(record.kind==='daily_reports'){data.planMonth=record.month;data.date=data.date.slice(0,10);data.type='tree_report';}
        else if(record.kind==='supportPlans')data.month=record.month;else data.startMonth=record.month;
        transaction.set(refs[n],data,{merge:true});
        auditDocumentWrite(transaction,{officeId:scope.officeId,book:scope.book,childId:record.childId,month:record.month,documentId:record.id,label:record.kind==='serviceHoursPlans'?'利用時間':record.data.status==='draft'?'案':record.data.status==='final'?'本案':'',operation:'CSV／JSONインポート'},snapshot.exists()?snapshot.data():null,data);saved++;
      });return {saved,skipped};
    });
    saved+=result.saved;skipped+=result.skipped;onProgress?.(saved,skipped);
  }
  if(scope.book==='implementation'&&saved)invalidateMonthlyTreeCommunications(scope.officeId,scope.month,scope.childId);
  return {saved,skipped};
}

/** Existing daily-report backups remain readable through the consolidated import entry. */
export function parseTransferFile(text:string,format:'csv'|'json',scope:TransferScope):TransferRecord[]{
  try{return parseTransfer(text,format);}catch(original){
    if(scope.book!=='implementation')throw original;
    let legacy:any[];
    if(format==='json'){const value=JSON.parse(text.replace(/^\uFEFF/,''));if(!Array.isArray(value))throw original;legacy=value;}
    else{const wb=XLSX.read(text.replace(/^\uFEFF/,''),{type:'string',raw:true});legacy=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:true});if(!legacy.length||!legacy[0].id||legacy[0].kind)throw original;}
    const records=legacy.map(value=>{
      const child=scopeChildren(scope).find(child=>child.id===value.childId);
      if(!child||!value.id||!excelExportOfficePriority(value,value.id,child,scope.officeId,scope.month))throw new Error('旧バックアップに対象外の児童・事業所の記録があります。');
      const data:Record<string,any>={};
      for(const field of TRANSFER_FIELDS.daily_reports){
        const parts=field.split('.');let item=Object.hasOwn(value,field)?value[field]:parts.reduce((entry,key)=>entry?.[key],value);
        if(['date','createdAt'].includes(field)){
          const seconds=value[field+'.seconds']??item?.seconds;
          if(seconds!==undefined)item=new Date(Number(seconds)*1000).toISOString();
        }
        if(item===undefined||item==='')continue;
        if(['content.supportContent'].includes(field)&&typeof item==='string')item=JSON.parse(item);
        if(['archived','content.isVerified'].includes(field)&&typeof item==='string')item=item.toLowerCase()==='true';
        if(parts.length===2)(data[parts[0]]??={})[parts[1]]=item;else data[field]=item;
      }
      return {kind:'daily_reports',id:value.id,childId:child.id,childName:child.fullName,officeId:scope.officeId,month:value.planMonth||String(data.date||'').slice(0,7),data};
    });
    return parseTransfer(JSON.stringify({format:'syorui-documents',version:1,records}),'json');
  }
}
