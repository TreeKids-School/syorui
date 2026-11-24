import {professionalVariantSuffix} from '../lib/professionalPlanDraft';
import {useRef,useState} from 'react';
import * as XLSX from 'xlsx';
import {saveProfessionalPlanImport} from '../lib/saveProfessionalPlanImport';
import type {Child} from '../data/mockData';
import {parseProfessionalWorkbook,type ParsedPeriodData} from '../lib/professionalPlanImport';
import {resolvePlanImportChild,uniqueImportChildren,selectPlanImportFiles,allocatePlanImportTargets,planImportReadiness} from '../lib/professionalPlanBulkImport';
import {ViewportModal} from './ViewportModal';
import {DropdownSelect} from './ui/DropdownSelect';

type Entry={path:string;childId:string;periods:Record<string,ParsedPeriodData>;error:string;enabled:boolean;confirmed:boolean;warnings?:string[];result?:string;done?:boolean};
export function ProfessionalPlanBulkImportModal({childrenData,officeId,officeName,onClose}:{childrenData:Child[];officeId:string;officeName:string;onClose:()=>void}){
  const [entries,setEntries]=useState<Entry[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[overwrite,setOverwrite]=useState(false);
  const [includeSubfolders,setIncludeSubfolders]=useState(false),[excludedSubfolders,setExcludedSubfolders]=useState(0);
  const chosenFiles=useRef<File[]>([]),rowElements=useRef(new Map<number,HTMLTableRowElement>());
  const children=uniqueImportChildren(childrenData);
  const files=useRef<HTMLInputElement>(null),folder=useRef<HTMLInputElement>(null);
  const update=(index:number,patch:Partial<Entry>)=>setEntries(prev=>prev.map((item,i)=>i===index?{...item,...patch}:item));
  async function readFiles(list:FileList|File[]|null,recursive=includeSubfolders){
    if(!list?.length)return;
    chosenFiles.current=Array.from(list);
    const selection=selectPlanImportFiles(chosenFiles.current,recursive);setExcludedSubfolders(selection.excludedSubfolders);
    setBusy(true);setEntries([]);setMessage('Excelを読み取り中です。まだ保存していません。');
    const next:Entry[]=[];
    for(const file of selection.files){
      const path=file.webkitRelativePath||file.name;
      try{
        const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
        const matching=resolvePlanImportChild(path,workbook,children),childId=matching.childId;
        const parsed=parseProfessionalWorkbook(workbook,childId);
        next.push({path,childId,periods:parsed.periods,warnings:[...matching.warnings,...parsed.logs.filter(log=>/エラー|警告|推測|フォールバック/.test(log))],error:'',enabled:true,confirmed:false});
      }catch(error){next.push({path,childId:'',periods:{},error:error instanceof Error?error.message:'解析できませんでした',enabled:false,confirmed:false});}
      setMessage(`${next.length}ファイルを解析しました。まだ保存していません。`);
    }
    setEntries(next);setBusy(false);setMessage(next.length?'ファイルと児童の対応、対象月を確認し、各行の「確認済み」にチェックしてください。':'対象のExcelファイルがありません。');
    if(files.current)files.current.value='';if(folder.current)folder.current.value='';
  }
  const {pending,unmatched,unconfirmed,canSave}=planImportReadiness(entries,officeId);
  const allocated=allocatePlanImportTargets(entries,officeId);
  const keys=new Set(allocated.flatMap((targets,index)=>entries[index].done?[]:targets.map(target=>target.collection+'/'+target.id)));
  const hasNumbered=allocated.some(targets=>targets.some(target=>Number(target.data.variantIndex)>0));
  const markMatchedConfirmed=()=>setEntries(previous=>previous.map(entry=>entry.enabled&&!entry.done&&!entry.error&&entry.childId?{...entry,confirmed:true}:entry));
  const goToIssue=()=>{const index=entries.findIndex(entry=>entry.enabled&&!entry.done&&!entry.error&&(!entry.childId||!entry.confirmed));const row=rowElements.current.get(index);row?.scrollIntoView({block:'center',behavior:'smooth'});row?.focus({preventScroll:true});};
  async function save(){
    if(!canSave||busy)return;
    setBusy(true);setMessage('保存中です。このウィンドウを閉じずにお待ちください。');
    let failed=false;
    for(let i=0;i<entries.length;i++){
      const entry=entries[i];if(!entry.enabled||entry.done||entry.error)continue;
      try{
        const targets=allocated[i];
        const count=await saveProfessionalPlanImport(targets,overwrite);
        update(i,{done:true,result:`保存 ${count.saved}件／既存のためスキップ ${count.skipped}件`});
      }catch(error){failed=true;update(i,{result:'保存失敗：'+(error instanceof Error?error.message:'再試行してください')});}
    }
    setBusy(false);setMessage(failed?'一部の保存に失敗しました。保存済みのファイルは再処理せず、失敗分だけ再試行できます。':'選択したファイルの取り込みが完了しました。');
  }
  return <ViewportModal className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-900/50 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="bulk-plan-title" className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 p-5"><h2 id="bulk-plan-title" className="text-lg font-bold">個別支援計画書の初回一括インポート</h2><button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-xl border px-4 text-sm disabled:opacity-50">閉じる</button></header>
      <div className="space-y-4 overflow-y-auto p-5">
        <p className="text-sm text-slate-700">保存先の事業所：<strong>{officeName}</strong>。Excel内の全期間の本案・案・利用時間を取り込みます。原本Excelは変更しません。</p>
        <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>folder.current?.click()} className="min-h-10 rounded-xl bg-primary px-4 text-sm text-white disabled:opacity-50">フォルダを選択</button><button disabled={busy} onClick={()=>files.current?.click()} className="min-h-10 rounded-xl border px-4 text-sm disabled:opacity-50">Excelを複数選択</button></div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" disabled={busy} checked={includeSubfolders} onChange={event=>{const value=event.target.checked;setIncludeSubfolders(value);if(chosenFiles.current.length)void readFiles(chosenFiles.current,value);}}/>サブフォルダも含める（標準はフォルダ直下のみ）</label>
        {!!excludedSubfolders&&<p className="text-sm text-slate-500">サブフォルダ内のExcel {excludedSubfolders}件を除外しました。</p>}
        <input ref={files} hidden type="file" multiple accept=".xlsx,.xlsm,.xls" onChange={event=>void readFiles(event.target.files)}/>
        <input ref={folder} hidden type="file" multiple {...{webkitdirectory:''}} onChange={event=>void readFiles(event.target.files)}/>
        <p role="status" className="text-sm text-slate-600">{message}</p>
        <p className="text-xs text-slate-500">児童氏名が読める場合はその氏名を優先し、それ以外はファイル名・フォルダ名で照合します。一致を特定できないものは取り込み先の児童を選択してください。児童の新規作成は行いません。</p>
        {!!entries.length&&<div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['対象','ファイル名','対応する児童','対象月・書類','確認'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{entries.map((entry,index)=><tr key={index} ref={element=>{if(element)rowElements.current.set(index,element);else rowElements.current.delete(index);}} tabIndex={-1} className="border-t border-slate-200 align-top focus:outline-2 focus:outline-primary">
          <td className="p-3"><input aria-label={entry.path+'を取り込む'} type="checkbox" checked={entry.enabled} disabled={busy||!!entry.error||entry.done} onChange={e=>update(index,{enabled:e.target.checked})}/></td>
          <td className="max-w-64 break-all p-3">{entry.path}{entry.error&&<p role="alert" className="mt-2 text-rose-600">{entry.error}</p>}{!!entry.warnings?.length&&<details className="mt-2 text-xs text-amber-700"><summary>解析時の確認事項 {entry.warnings.length}件</summary>{entry.warnings.map((warning,n)=><p key={n} className="mt-1">{warning}</p>)}</details>}{entry.result&&<p className="mt-2 text-primary">{entry.result}</p>}</td>
          <td className="min-w-48 p-3">{!entry.error&&(busy||entry.done?<span>{children.find(c=>c.id===entry.childId)?.fullName||'未選択'}</span>:<DropdownSelect label="対応する児童" value={entry.childId} onChange={childId=>update(index,{childId,confirmed:false})} options={[{value:'',label:'児童を選択してください'},...children.map(c=>({value:c.id!,label:c.fullName+(c.archived?'（アーカイブ）':'')}))]}/>)}{!entry.childId&&!entry.error&&<p className="mt-2 text-xs text-amber-700">一致を特定できません。選択してください。</p>}</td>
          <td className="min-w-48 p-3">{!!allocated[index].length&&<ul className="mb-2 space-y-1 text-slate-700">{allocated[index].map(target=><li key={target.collection+target.id}>{String(target.data.startMonth)}：{target.collection==='serviceHoursPlans'?'利用時間':target.data.status==='draft'?'案':'本案'}{professionalVariantSuffix(Number(target.data.variantIndex))}</li>)}</ul>}<ul className="space-y-1 text-xs text-slate-500">{Object.values(entry.periods).sort((a,b)=>a.startMonth.localeCompare(b.startMonth)).map(period=><li key={period.startMonth+professionalVariantSuffix(period.variantIndex)}>{period.startMonth}{professionalVariantSuffix(period.variantIndex)}：{[period.finalPlan?'本案':'',period.draftPlan?'案':'',period.serviceHours?'利用時間':''].filter(Boolean).join('・')}{period.hoursSheetName&&<span className="mt-1 block text-xs text-blue-700">利用時間「{period.hoursSheetName}」 → {period.hoursEffectiveStart?'開始年月日 '+period.hoursEffectiveStart:period.hoursPlanSheetName?'本案「'+period.hoursPlanSheetName+'」':'シート内の年月'}</span>}</li>)}</ul></td>
          <td className="p-3">{!entry.error&&<label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={entry.confirmed} disabled={busy||entry.done||!entry.childId||!entry.enabled} onChange={e=>update(index,{confirmed:e.target.checked})}/>確認済み</label>}</td>
        </tr>)}</tbody></table></div>}
        {hasNumbered&&<p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">同じ開始月の追加書類は（1）、（2）を付けて別々に登録します。</p>}
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm"><input type="checkbox" disabled={busy} checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/><span>同じ児童・月・本案／案・利用時間の既存データも上書きする<span className="mt-1 block text-xs text-slate-500">チェックしない場合は既存データを保持し、新しい書類だけを保存します。</span></span></label>
      </div>
      <footer className="space-y-3 border-t border-slate-200 p-5 text-sm">
        {!!pending.length&&<div className="flex flex-wrap items-center justify-between gap-3"><span role="status">児童未選択 {unmatched}件／未確認 {unconfirmed}件</span><div className="flex flex-wrap gap-2">{!!(unmatched+unconfirmed)&&<button disabled={busy} type="button" onClick={goToIssue} className="min-h-10 rounded-xl border px-3 text-sm">未完了の行へ</button>}{!!unconfirmed&&<button disabled={busy} type="button" onClick={markMatchedConfirmed} className="min-h-10 rounded-xl border px-3 text-sm">児童が選択済みの {unconfirmed}件を確認済みにする</button>}</div></div>}
        {!canSave&&!!pending.length&&<p className="text-xs text-amber-700">{unmatched?'児童が未選択のファイルがあります。児童を選ぶか、対象から外してください。':unconfirmed?'対応一覧を確認し、「確認済み」にチェックしてください。':''}</p>}
        <div className="flex items-center justify-end gap-4"><span>{pending.length}ファイル／{keys.size}書類</span><button disabled={busy||!canSave} onClick={()=>void save()} className="min-h-10 rounded-xl bg-primary px-5 font-bold text-white disabled:opacity-40">{busy?'処理中…':'確認した内容を一括保存'}</button></div>
      </footer>
    </section>
  </ViewportModal>;
}
