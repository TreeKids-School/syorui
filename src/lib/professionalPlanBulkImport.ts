import {professionalPlanDraft} from './professionalPlanDraft';
import * as XLSX from 'xlsx';
import type {Child} from '../data/mockData';
import type {ParsedPeriodData} from './professionalPlanImport';
export const normalizeImportName=(value:string)=>value.normalize('NFKC').replace(/[\s　・･]/g,'');
export function uniqueImportChildren(children:Child[]):Child[]{
  const ids=new Map<string,Child>();
  for(const child of children)if(child.id){const prior=ids.get(child.id);if(!prior||(prior.archived&&!child.archived))ids.set(child.id,child);}
  return [...ids.values()];
}
function namedCandidates(name:string,children:Child[]){
  const matches=uniqueImportChildren(children).filter(child=>normalizeImportName(child.fullName)===normalizeImportName(name));
  const active=matches.filter(child=>!child.archived);
  return active.length?active:matches;
}
export function matchPlanImportChild(path:string,children:Child[]):string {
  // A child's name in a parent folder must not override the actual file name.
  for(const segment of path.split(/[\\/]/).reverse()){
    const name=normalizeImportName(segment);
    let matches=uniqueImportChildren(children).filter(child=>normalizeImportName(child.fullName)&&name.includes(normalizeImportName(child.fullName)));
    if(!matches.length)continue;
    const longest=Math.max(...matches.map(child=>normalizeImportName(child.fullName).length));
    matches=matches.filter(child=>normalizeImportName(child.fullName).length===longest);
    const active=matches.filter(child=>!child.archived);if(active.length)matches=active;
    return matches.length===1?matches[0].id!:'';
  }
  return '';
}
export function workbookChildNames(workbook:XLSX.WorkBook):string[] {
  const explicit=new Set<string>(),generic=new Set<string>();
  for(const sheetName of workbook.SheetNames){
    if(sheetName.includes('原本'))continue;
    const grid=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName],{header:1,raw:false});
    for(const row of grid.slice(0,20))for(let col=0;col<row.length;col++){
      const value=String(row[col]||'').normalize('NFKC').replace(/\s/g,'');
      const match=value.match(/^(児童氏名|利用児氏名|利用者氏名|利用児名|氏名)(?:[：:](.*))?$/);
      if(!match)continue;
      const next=match[2]||row.slice(col+1,col+7).find(v=>String(v||'').trim());
      if(next){const name=String(next).trim().replace(/(?:様|さん)$/,'').trim();if(name)(match[1]==='氏名'?generic:explicit).add(name);}
    }
  }
  return [...(explicit.size?explicit:generic)];
}
export function resolvePlanImportChild(path:string,workbook:XLSX.WorkBook,children:Child[]):{childId:string;warnings:string[]}{
  const names=workbookChildNames(workbook),warnings:string[]=[],ids=new Set<string>();
  let unknown=0;
  for(const name of names){const matches=namedCandidates(name,children);if(!matches.length)unknown++;for(const child of matches)ids.add(child.id!);}
  const fileId=matchPlanImportChild(path,children);
  if(unknown)warnings.push('児童名欄に、児童一覧と一致しない表記が'+unknown+'件あります。対応する児童を確認してください。');
  if(ids.size>1){warnings.push('児童名欄から対応を1人に絞れませんでした。誤字・旧表記・同名の登録を確認し、取り込み先の児童を選択してください。');return {childId:'',warnings};}
  const sheetId=[...ids][0]||'';
  if(sheetId&&fileId&&sheetId!==fileId){warnings.push('ファイル名と児童名欄の照合結果が異なります。取り込み先の児童を選択してください。');return {childId:'',warnings};}
  return {childId:sheetId||fileId,warnings};
}
export function planImportTargets(periods:Record<string,ParsedPeriodData>,childId:string,officeId:string){
  if(!childId || !officeId)throw new Error('児童と事業所を選択してください。');
  const targets:{collection:string;id:string;data:Record<string,unknown>}[]=[];
  for(const period of Object.values(periods)){
    if(period.skipImport)continue;
    for(const plan of [period.draftPlan,period.finalPlan])if(plan){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period.startMonth)||!['draft','final'].includes(plan.status||''))throw new Error('対象月または案・本案の判定を確認してください。');
      targets.push(professionalPlanDraft({...plan,startMonth:period.startMonth,variantIndex:period.variantIndex||0},childId,officeId,period.startMonth,plan.status!));
    }
    if(period.serviceHours)targets.push(professionalPlanDraft({...period.serviceHours,startMonth:period.startMonth,variantIndex:period.variantIndex||0},childId,officeId,period.startMonth,'hours'));
  }
  return targets;
}

/** Allocate deterministic suffixes across the selected files, including already completed files on retry. */
export function allocatePlanImportTargets(entries:{enabled:boolean;childId:string;error?:string;periods:Record<string,ParsedPeriodData>}[],officeId:string){
  const counts=new Map<string,number>();
  return entries.map(entry=>{
    if(!entry.enabled||!entry.childId||entry.error||!officeId)return [];
    return planImportTargets(entry.periods,entry.childId,officeId).map(target=>{
      const kind=target.collection==='serviceHoursPlans'?'hours':target.data.status as 'draft'|'final';
      const month=String(target.data.startMonth),key=entry.childId+'_'+month+'_'+kind;
      const index=counts.get(key)||0;counts.set(key,index+1);
      return professionalPlanDraft({...target.data,childId:entry.childId,createdAt:String(target.data.createdAt||''),startMonth:month,variantIndex:index} as import('../types/professionalPlan').ProfessionalPlanDoc,entry.childId,officeId,month,kind);
    });
  });
}

export function selectPlanImportFiles<T extends {name:string;webkitRelativePath?:string}>(files:T[],includeSubfolders=false){
  let excludedSubfolders=0;
  const selected=files.filter(file=>{
    if(!/\.(xlsx|xlsm|xls)$/i.test(file.name)||file.name.startsWith('~$'))return false;
    const depth=(file.webkitRelativePath||'').split(/[\\/]/).filter(Boolean).length;
    if(!includeSubfolders&&depth>2){excludedSubfolders++;return false;}
    return true;
  });
  return {files:selected,excludedSubfolders};
}

export function planImportReadiness<T extends {enabled:boolean;done?:boolean;error?:string;childId:string;confirmed:boolean}>(entries:T[],officeId:string){
  const pending=entries.filter(entry=>entry.enabled&&!entry.done&&!entry.error);
  const unmatched=pending.filter(entry=>!entry.childId).length;
  const unconfirmed=pending.filter(entry=>entry.childId&&!entry.confirmed).length;
  return {pending,unmatched,unconfirmed,canSave:!!officeId&&pending.length>0&&unmatched===0&&unconfirmed===0};
}
