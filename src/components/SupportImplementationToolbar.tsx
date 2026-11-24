import {MonthlyTaskLabel} from './MonthlyTaskLabel';
import {DropdownPanel} from './ui/DropdownPanel';
import type {ReactNode} from 'react';
import {HeaderAccountActions} from './HeaderAccountActions';
import {menuActionClass,menuSurfaceClass,menuTriggerClass} from './ui/menuStyles';
import {useEffect, useRef, useState} from 'react';
import {Calendar, ChevronDown, History, Printer, Settings, Download, Upload} from 'lucide-react';
type Props = {
  monthPicker?:ReactNode;
  compact?:boolean;
  onAuthorSettings?:()=>void;
  onPrint:()=>void; onExport:()=>void; onImport:()=>void;
  onImportResults:()=>void; onHistory:()=>void;
};
export function SupportImplementationToolbar(props:Props) {
  const [open,setOpen]=useState<'tasks'|null>(null);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(null);};
    const resize=()=>setOpen(null);
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};
  },[open]);
  const run=(action:()=>void)=>{setOpen(null);action();};
  const item=menuActionClass;
  const icon='flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100';
  const panel='absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] '+menuSurfaceClass;
  return <div ref={root} className="relative z-40 flex flex-wrap items-center justify-end gap-2.5" onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();setOpen(null);root.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus();}}} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(null);}}>
    {!props.compact&&<div className="relative">
      <button type="button" aria-expanded={open==='tasks'} aria-controls="support-monthly-tasks" onClick={()=>setOpen(open==='tasks'?null:'tasks')} className={menuTriggerClass}><Calendar size={17} className="text-primary"/>月次作業<ChevronDown size={15}/></button>
      {open==='tasks'&&<section id="support-monthly-tasks" aria-label="月次作業" className={panel.replace('w-72','w-80')+' max-h-[70dvh] overflow-y-auto'}>
        <SupportMonthlyWorkflow onImportResults={()=>run(props.onImportResults)} onExcelExport={()=>run(props.onExport)} />
      </section>}
    </div>}
    {!props.compact&&<button type="button" aria-label="印刷" title="印刷設定とプレビュー" onClick={props.onPrint} className={icon}><Printer size={20}/></button>}
    {props.monthPicker}
    <div onClick={()=>setOpen(null)}><DropdownPanel label="専門的支援実施計画の設定" itemCount={4} preferredHeight={280} icon={<Settings size={20}/>}>
      {close=><>{props.onAuthorSettings&&<button type="button" className={item} onClick={()=>{close();props.onAuthorSettings!();}}><Calendar size={17}/>作成者・作成日の設定</button>}<button type="button" className={item} onClick={()=>{close();props.onHistory();}}><History size={17}/>変更履歴</button><button type="button" className={item} onClick={()=>{close();props.onExport();}}><Download size={17}/>エクスポート</button><button type="button" className={item} onClick={()=>{close();props.onImport();}}><Upload size={17}/>インポート</button></>}
    </DropdownPanel></div>
      {!props.compact&&<HeaderAccountActions />}
  </div>;
}

export function SupportMonthlyWorkflow({onImportResults,onExcelExport}:{onImportResults:()=>void;onExcelExport:()=>void}) {
  const rowClass='group/task flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';
  const numberClass='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary';
  return <>
    <div className="px-3 pb-2 pt-2 text-xs font-semibold text-slate-400">月末</div>
    <ol className="space-y-1">
      <li><button type="button" onClick={onImportResults} className={rowClass}><span className={numberClass}>1</span><MonthlyTaskLabel title="療育結果を作成・一括登録" description="プロンプト・ツリー通信のコピーから、結果の貼り付け・確認・登録までをこの画面で行います。"/></button></li>
      <li><button type="button" onClick={onExcelExport} className={rowClass}>
        <span className={numberClass}>2</span><MonthlyTaskLabel title="エクスポート" description="CSV・JSON・Excelから形式を選び、対象月の書類を出力します。"/>
      </button></li>
    </ol>
  </>;
}
