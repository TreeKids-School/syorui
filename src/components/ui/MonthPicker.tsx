import {ChevronLeft,ChevronRight} from 'lucide-react';
import {shiftCalendarMonth} from '../../lib/calendarMonth';
import {menuTriggerClass} from './menuStyles';

/** 表の隅は狭い幅に収め、書類中は標準の横1行で表示する。 */
export function MonthPicker({value,onChange,layout='stacked'}:{value:string;onChange:(month:string)=>void;layout?:'stacked'|'inline'}) {
  const [year,month]=value.split('-');
  const openPicker=(input:HTMLInputElement)=>{
    if(typeof input.showPicker==='function'){
      try{input.showPicker();}catch{input.focus();}
    }
  };
  const input=<input data-print-exclude type="month" aria-label="対象月を選択" value={value} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onClick={event=>openPicker(event.currentTarget)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '||event.key==='ArrowDown'){event.preventDefault();openPicker(event.currentTarget);}}} onChange={event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))onChange(event.target.value);}}/>;
  if(layout==='stacked'){
    const arrowClass='absolute bottom-0 z-10 flex h-8 w-4 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary';
    return <div className="relative min-w-0 w-full">
      <label className="relative flex min-h-13 w-full cursor-pointer flex-col items-center rounded-lg text-center text-sm text-slate-700 hover:bg-white focus-within:outline-2 focus-within:outline-primary" title="対象月を選択">
        <span data-summary-month aria-hidden="true" className="pointer-events-none block w-full whitespace-nowrap tabular-nums"><span style={{display:'block'}} className="text-sm font-medium leading-5">{year}年</span><span style={{display:'block'}} className="text-sm font-bold leading-8">{Number(month)}月</span></span>
        {input}
      </label>
      <button data-print-exclude type="button" aria-label="前月" title="前月" onClick={()=>onChange(shiftCalendarMonth(value,-1))} className={arrowClass+' left-0'}><ChevronLeft size={12}/></button>
      <button data-print-exclude type="button" aria-label="次月" title="次月" onClick={()=>onChange(shiftCalendarMonth(value,1))} className={arrowClass+' right-0'}><ChevronRight size={12}/></button>
    </div>;
  }
  const arrowClass=menuTriggerClass.replace('px-3','px-2')+' h-10 w-10 shrink-0';
  return <div className="flex items-center justify-center gap-0.5">
    <button data-print-exclude type="button" aria-label="前月" title="前月" onClick={()=>onChange(shiftCalendarMonth(value,-1))} className={arrowClass}><ChevronLeft size={20}/></button>
    <label className="relative inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-transparent px-2 py-1 text-sm font-semibold text-slate-700 hover:border-slate-200 hover:bg-slate-50 focus-within:outline-2 focus-within:outline-primary" title="対象月を選択">
      <span data-summary-month aria-hidden="true" className="pointer-events-none whitespace-nowrap tabular-nums">{year}年{Number(month)}月分</span>
      {input}
    </label>
    <button data-print-exclude type="button" aria-label="次月" title="次月" onClick={()=>onChange(shiftCalendarMonth(value,1))} className={arrowClass}><ChevronRight size={20}/></button>
  </div>;
}
