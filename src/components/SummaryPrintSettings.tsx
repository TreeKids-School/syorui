import {useEffect,useMemo,useRef,useState} from 'react';
import {Printer,X} from 'lucide-react';
import {ViewportModal} from './ViewportModal';
import {SettingsGroup,settingsRowClass} from './SettingsGroup';
import {summaryPrintHtml,summaryPrintPage,printSummaryTable} from '../lib/printSummaryTable';
import type {SummaryPrintOptions} from '../lib/printSummaryTable';

export function SummaryPrintSettings({table,options,onChange,onClose,onPrintSupport,supportChildCount=0}:{table:HTMLTableElement;options:SummaryPrintOptions;onChange:(options:SummaryPrintOptions)=>void;onClose:()=>void;onPrintSupport?:()=>void;supportChildCount?:number}) {
  const [scale,setScale]=useState(0.6),[printing,setPrinting]=useState(false),[error,setError]=useState('');
  const area=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null);
  const page=summaryPrintPage(options.orientation),childrenRows=table.dataset.tableOrientation==='children-rows';
  const preview=useMemo(()=>{try{return {html:summaryPrintHtml(table,options),error:''};}catch(error){return {html:'',error:error instanceof Error?error.message:'プレビューを作成できませんでした。'};}},[table,options]);
  const update=(patch:Partial<SummaryPrintOptions>)=>{setError('');onChange({...options,...patch});};
  useEffect(()=>{
    const target=area.current;if(!target)return;
    const resize=()=>setScale(Math.min(1,Math.max(0.1,(target.clientWidth-24)/(page.width*96/25.4))));
    resize();const observer=new ResizeObserver(resize);observer.observe(target);return()=>observer.disconnect();
  },[page.width]);
  useEffect(()=>{
    setError('');
    const receive=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.data?.type==='summary-print-error')setError('プレビューの調整に失敗しました。設定を変更して再度お試しください。');};
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[preview.html]);
  return <ViewportModal className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 print:hidden" onKeyDown={event=>{if(event.key==='Escape'&&!printing)onClose();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="summary-print-title" className="flex h-[94dvh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3"><h2 id="summary-print-title" className="flex items-center gap-2 font-bold text-slate-800"><Printer size={18}/>実施状況の印刷設定</h2><button autoFocus type="button" aria-label="印刷設定を閉じる" disabled={printing} onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={22}/></button></header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="shrink-0 space-y-5 border-b bg-white p-4 lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="text-sm font-semibold text-slate-700">{options.year}年{options.month}月分</p>
          {onPrintSupport&&<SettingsGroup title="専門的支援実施計画"><div className="space-y-2 p-3"><p className="text-xs leading-relaxed text-slate-500">採用日が選ばれている児童全員の計画を、採用日の記録でまとめて印刷します。</p><button type="button" disabled={!supportChildCount||printing} onClick={onPrintSupport} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Printer size={18}/>{supportChildCount}名分の印刷設定を開く</button></div></SettingsGroup>}
          <SettingsGroup title="用紙とレイアウト">
            <label className={settingsRowClass}>A3横・1枚<input type="radio" name="summary-print-orientation" checked={options.orientation==='landscape'} onChange={()=>update({orientation:'landscape'})} className="accent-green-600"/></label>
            <label className={settingsRowClass}>A3縦・1枚<input type="radio" name="summary-print-orientation" checked={options.orientation==='portrait'} onChange={()=>update({orientation:'portrait'})} className="accent-green-600"/></label>
          </SettingsGroup>
          <SettingsGroup title="表の配置">{([['center','中央寄せ'],['left','左寄せ'],['right','右寄せ']] as const).map(([value,label])=><label key={value} className={settingsRowClass}>{label}<input type="radio" name="summary-print-alignment" checked={options.alignment===value} onChange={()=>update({alignment:value})} className="accent-green-600"/></label>)}</SettingsGroup>
          <SettingsGroup title="文字サイズ">
            <label className={settingsRowClass}>表の文字<span className="whitespace-nowrap"><input aria-label="表の文字サイズ" type="number" min={5} max={24} step={0.5} value={options.fontSize??9} onChange={event=>{if(event.target.value)update({fontSize:Math.max(5,Math.min(24,Number(event.target.value)))});}} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right"/> pt</span></label>
            <label className={settingsRowClass}>児童名<span className="whitespace-nowrap"><input aria-label="児童名の文字サイズ" type="number" min={5} max={24} step={0.5} value={options.nameFontSize??10.5} onChange={event=>{if(event.target.value)update({nameFontSize:Math.max(5,Math.min(24,Number(event.target.value)))});}} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right"/> pt</span></label>
          </SettingsGroup>
          <SettingsGroup title={childrenRows?'日付行の追加表示':'日付列の追加表示'}>
            <label className={settingsRowClass}>表の中央<input type="checkbox" checked={options.repeatDateMiddle} onChange={event=>update({repeatDateMiddle:event.target.checked})} className="h-4 w-4 accent-green-600"/></label>
            <label className={settingsRowClass}>{childrenRows?'表の一番下':'表の一番右'}<input type="checkbox" checked={options.repeatDateRight} onChange={event=>update({repeatDateRight:event.target.checked})} className="h-4 w-4 accent-green-600"/></label>
          </SettingsGroup>
          <SettingsGroup title="印刷する児童"><label className={settingsRowClass}>出席0日の児童を印刷しない<input type="checkbox" checked={options.excludeZeroAttendance} onChange={event=>update({excludeZeroAttendance:event.target.checked})} className="h-4 w-4 accent-green-600"/></label></SettingsGroup>
          <SettingsGroup title="印刷時の色付け"><label className={settingsRowClass}>児童の偶数{childrenRows?'行':'列'}に色を付ける<input type="checkbox" checked={options.stripeEvenColumns} onChange={event=>update({stripeEvenColumns:event.target.checked})} className="h-4 w-4 accent-green-600"/></label></SettingsGroup>
          {(preview.error||error)&&<p role="alert" className="text-sm text-rose-600">{preview.error||error}</p>}
        </aside>
        <div ref={area} className="min-h-[400px] min-w-0 flex-1 overflow-auto bg-slate-200 p-3">
          {preview.html?<div className="mx-auto" style={{width:page.width*96/25.4*scale,height:page.height*96/25.4*scale,position:'relative'}}><iframe ref={frame} title="実施状況のリアルタイム印刷プレビュー" sandbox="allow-scripts" srcDoc={preview.html} style={{width:page.width+'mm',height:page.height+'mm',border:0,position:'absolute',top:0,left:0,transform:'scale('+scale+')',transformOrigin:'top left',background:'white',boxShadow:'0 2px 12px #0002'}}/></div>:<p className="p-6 text-center text-sm text-slate-600">{preview.error}</p>}
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t bg-slate-50 px-4 py-3"><button type="button" disabled={printing} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600">閉じる</button><button type="button" disabled={printing||!preview.html||!!error} onClick={async()=>{setPrinting(true);setError('');try{await printSummaryTable(table,options);}catch(error){setError(error instanceof Error?error.message:'印刷画面を開けませんでした。');}finally{setPrinting(false);}}} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Printer size={16}/>{printing?'印刷画面を準備中…':'印刷する'}</button></footer>
    </section>
  </ViewportModal>;
}
