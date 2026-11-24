import {supportBatchPrintHtml,printSupportBatch} from '../lib/supportImplementationPrint';
import type {SupportPrintBatchDocument} from '../lib/supportImplementationPrint';
import {professionalPrintCells,professionalPrintDefaultFonts,professionalPrintHtml,printProfessionalDocuments,PROFESSIONAL_PRINT_PAGE} from '../lib/professionalPlanPrint';
import type {ProfessionalPrintDocument} from '../lib/professionalPlanPrint';
import {ViewportModal} from './ViewportModal';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Printer, X} from 'lucide-react';
import {applySupportPrintFontSize, selectSupportPrintCell, cellFontSize, PRINT_FIELDS, PRINT_LABELS, printSupportDocument, supportPrintHtml, supportPrintLayout, SUPPORT_PRINT_PAGE} from '../lib/supportImplementationPrint';
import type {SupportPrintDocument, SupportPrintRow} from '../lib/supportImplementationPrint';

const EMPTY_ROWS:SupportPrintRow[]=[];
export function SupportImplementationPrintSettings({documentData,rows:inputRows,professionalDocuments,batchDocuments,onClose}:{
  documentData?:SupportPrintDocument;rows?:SupportPrintRow[];professionalDocuments?:ProfessionalPrintDocument[];batchDocuments?:SupportPrintBatchDocument[];onClose:()=>void;
}) {
  const rows=inputRows||EMPTY_ROWS;
  const isProfessional=professionalDocuments!==undefined;
  const isBatch=batchDocuments!==undefined;
  const page=isProfessional?PROFESSIONAL_PRINT_PAGE:SUPPORT_PRINT_PAGE;
  const title=isProfessional?'個別支援計画書の印刷設定':isBatch?'専門的支援実施計画の一括印刷設定':'専門的支援実施計画の印刷設定';
  const items=useMemo(()=>isProfessional?professionalDocuments!.map(doc=>({key:doc.key,date:doc.label,verified:true})):isBatch?batchDocuments!.flatMap(doc=>doc.rows.map(row=>({...row,date:doc.documentData.childName+'・'+row.date}))):rows,[professionalDocuments,rows,isProfessional,isBatch,batchDocuments]);
  const [selected, setSelected] = useState(() => new Set(items.map(row => row.key)));
  const [fonts, setFonts] = useState<Record<string, number>>(()=>professionalDocuments?professionalPrintDefaultFonts(professionalDocuments):{});
  const [professionalSignDates,setProfessionalSignDates]=useState({draft:false,final:false});
  const [goalHeight, setGoalHeight] = useState(40);
  const [selectedCells,setSelectedCells]=useState<string[]>([professionalDocuments?.[0] ? professionalDocuments[0].key+':childName' : rows[0] ? `${rows[0].key}:resultInfo` : 'goals']);
  const [multiSelect,setMultiSelect]=useState(false);
  const [overflow, setOverflow] = useState<string[]>([]);
  const [scale, setScale] = useState(0.7);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const previewArea = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const selectedRows = items.filter(row => selected.has(row.key));
  const selectedDocuments=useMemo(()=>professionalDocuments?.filter(doc=>selected.has(doc.key))||[],[professionalDocuments,selected]);
  const selectedBatch=useMemo(()=>batchDocuments?.map(doc=>({...doc,rows:doc.rows.filter(row=>selected.has(row.key))})).filter(doc=>doc.rows.length)||[],[batchDocuments,selected]);
  const batchOverLimit=selectedBatch.some(doc=>doc.rows.length>6);
  const batchPreview=selectedBatch.map(doc=>({...doc,rows:doc.rows.slice(0,6)}));
  const cells = useMemo(()=>isProfessional?professionalPrintCells(selectedDocuments,{professionalSignDates}):isBatch?selectedBatch.flatMap(doc=>[{key:doc.key+':goals',label:doc.documentData.childName+'・支援目標'},...doc.rows.slice(0,6).flatMap(row=>PRINT_FIELDS.map(field=>({key:row.key+':'+field,label:doc.documentData.childName+'・'+row.date+'・'+PRINT_LABELS[field]})))]):[{key:'goals',label:'支援目標'},...rows.filter(row=>selected.has(row.key)).slice(0,6).flatMap(row=>PRINT_FIELDS.map(field=>({key:`${row.key}:${field}`,label:`${row.date}・${PRINT_LABELS[field]}`})))],[isProfessional,isBatch,selectedBatch,selectedDocuments,rows,selected,professionalSignDates]);
  const pageCount=isProfessional?Math.max(1,selectedDocuments.length):isBatch?Math.max(1,selectedBatch.length):1;
  const validSelected=selectedCells.filter(key=>cells.some(cell=>cell.key===key));
  const sizes=validSelected.map(key=>cellFontSize(fonts,key));
  const commonSize=sizes.length>0 && sizes.every(size=>size===sizes[0]) ? sizes[0] : '';
  const selectedCellsRef=useRef(validSelected);
  selectedCellsRef.current=validSelected;
  const settings = {fonts,goalHeight,professionalSignDates,selectedCell:validSelected[0]||'',selectedCells:validSelected};
  const html = useMemo(()=>isProfessional?professionalPrintHtml(selectedDocuments,{fonts,goalHeight,professionalSignDates,selectedCell:''},true):isBatch?supportBatchPrintHtml(batchPreview,{fonts,goalHeight,selectedCell:''},true):supportPrintHtml(documentData!,rows.filter(row=>selected.has(row.key)).slice(0,6),{fonts,goalHeight,selectedCell:''},true),[isProfessional,isBatch,batchDocuments,selectedDocuments,documentData,rows,selected,fonts,goalHeight,professionalSignDates]);
  const layout = supportPrintLayout(goalHeight);
  useEffect(() => {
    const area = previewArea.current;
    if (!area) return;
    const resize = () => setScale(Math.min(1, Math.max(0.1, (area.clientWidth - 24) / (page.width * 96 / 25.4))));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(area);
    return () => observer.disconnect();
  }, [page.width]);
  useEffect(() => {
    const valid = new Set(cells.map(cell => cell.key));
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'support-print-select' && valid.has(event.data.key)) setSelectedCells(previous=>selectSupportPrintCell(previous.filter(key=>valid.has(key)),event.data.key,multiSelect||event.data.additive===true));
      if (event.data?.type === 'support-print-overflow' && Array.isArray(event.data.keys)) setOverflow(event.data.keys.filter((key: unknown) => typeof key === 'string' && valid.has(key)));
    };
    window.addEventListener('message', receive);
    frame.current?.contentWindow?.postMessage({type: 'support-print-measure'}, '*');
    return () => window.removeEventListener('message', receive);
  }, [html,multiSelect,cells]);
  useEffect(()=>{
    const valid=new Set(cells.map(cell=>cell.key));
    setSelectedCells(previous=>previous.some(key=>!valid.has(key)) ? previous.filter(key=>valid.has(key)) : previous);
  },[cells]);
  useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'support-print-selection',keys:validSelected},'*');},[selectedCells,cells]);
  const setSize = (value: number) => {
    setFonts(previous=>applySupportPrintFontSize(previous,validSelected,value));
  };
  return <ViewportModal className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 print:hidden" onKeyDown={event => {if (event.key === 'Escape' && !printing) onClose();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="support-print-title" className="flex h-[94dvh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h2 id="support-print-title" className="flex items-center gap-2 font-bold text-slate-800"><Printer size={18} />{title}</h2>
        <button autoFocus type="button" aria-label="印刷設定を閉じる" disabled={printing} onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={22} /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="shrink-0 space-y-5 border-b bg-white p-4 lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <section className="space-y-2">
            <h3 className="text-sm font-bold">{isProfessional?'印刷する書類':isBatch?'印刷する採用日':'印刷する日'}　{selectedRows.length}{isProfessional?'枚':isBatch?'日（'+selectedBatch.length+'名）':' / 6日'}</h3>
            {!isProfessional && !isBatch && rows.length >= 6 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">アーカイブでない日が{rows.length}日あります。印刷は最大6日分です。{selectedRows.length > 6 ? '6日以内に絞ってください。プレビューは先頭6日分です。' : ''}</p>}
            {isBatch&&<div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{batchDocuments!.map(doc=><label key={doc.key} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm hover:bg-slate-50"><span>{doc.documentData.childName}（{doc.rows.filter(row=>selected.has(row.key)).length}日）</span><input aria-label={doc.documentData.childName+'の採用日をすべて印刷'} type="checkbox" checked={doc.rows.every(row=>selected.has(row.key))} onChange={event=>{const checked=event.target.checked;setSelected(previous=>{const next=new Set(previous);for(const row of doc.rows){if(checked)next.add(row.key);else next.delete(row.key);}return next;});}} className="h-4 w-4 accent-emerald-600"/></label>)}</div>}
            {isBatch&&<><p className="text-xs text-slate-500">採用日のある児童を、1名につきA4縦1枚で印刷します。印刷しない日はチェックを外してください。</p>{selectedBatch.filter(doc=>doc.rows.length>=6).map(doc=><p role="alert" key={doc.key} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{doc.documentData.childName}：{doc.rows.length}日。最大6日分です。{doc.rows.length>6?'6日以内に絞ってください。プレビューは先頭6日分です。':''}</p>)}</>}
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {items.map(row => <label key={row.key} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <span>{row.date}{!row.verified && <span className="ml-2 text-xs text-amber-700">未確認</span>}</span>
                <input type="checkbox" checked={selected.has(row.key)} onChange={event => {
                  const checked = event.target.checked;
                  setSelected(previous => {const next = new Set(previous); if (checked) next.add(row.key); else next.delete(row.key); return next;});
                  setOverflow([]);
                }} className="h-4 w-4 accent-emerald-600" />
              </label>)}
              {!items.length && <p className="p-2 text-xs text-slate-500">印刷できる書類がありません。</p>}
            </div>
          </section>
          {isProfessional&&<section className="space-y-2"><h3 className="text-sm font-bold">署名欄の日付</h3><p className="text-xs leading-relaxed text-slate-500">管理責任者欄の「印」の右側に表示します。</p>{([{key:'final',label:'本案に日付を表示'},{key:'draft',label:'案に日付を表示'}] as const).map(option=><label key={option.key} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm"><span>{option.label}</span><input type="checkbox" checked={professionalSignDates[option.key]} onChange={event=>setProfessionalSignDates(previous=>({...previous,[option.key]:event.target.checked}))}/></label>)}</section>}
          {isProfessional&&<section className="space-y-2"><h3 className="text-sm font-bold">固定レイアウト（A4横）</h3><p className="text-xs leading-relaxed text-slate-500">1書類を1枚に収めます。表は用紙の余白内いっぱいに配置します。</p></section>}
          {!isProfessional && <section className="space-y-2">
            <h3 className="text-sm font-bold">固定レイアウト（A4縦・1枚）</h3>
            <label className="flex items-center justify-between gap-2 text-sm">支援目標欄の高さ
              <span><input aria-label="支援目標欄の高さ" type="number" min={24} max={85} step={1} value={goalHeight} onChange={event => {if (event.target.value) setGoalHeight(Math.max(24, Math.min(85, Number(event.target.value))));}} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right" /> mm</span>
            </label>
            <p className="text-xs text-slate-500">1日分の高さ：{layout.rowHeight.toFixed(1)}mm</p>
          </section>}
          <section className="space-y-3">
            <h3 className="text-sm font-bold">文字サイズをまとめて調整</h3>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={multiSelect} onChange={event=>setMultiSelect(event.target.checked)} className="h-4 w-4 accent-emerald-600"/>複数選択モード</label>
            <p className="text-xs leading-relaxed text-slate-500">モードをONにすると、マスを押すたびに選択・解除できます。Ctrl／⌘＋クリックでも複数選べます。</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={()=>setSelectedCells(cells.map(cell=>cell.key))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">すべて選択</button>
              {!isProfessional&&<button type="button" onClick={()=>setSelectedCells(cells.filter(cell=>cell.key.endsWith(':resultInfo')).map(cell=>cell.key))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">結果のマス</button>}
              {!isProfessional&&<button type="button" onClick={()=>setSelectedCells(cells.filter(cell=>cell.key.endsWith(':futurePlan')).map(cell=>cell.key))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">予定のマス</button>}
              <button type="button" onClick={()=>setSelectedCells([])} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">選択解除</button>
            </div>
            <p role="status" className="text-sm font-semibold text-slate-700">{validSelected.length}マス選択中</p>
            <div aria-label="文字サイズを調整するマス" className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {cells.map(cell=><label key={cell.key} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50"><input type="checkbox" checked={validSelected.includes(cell.key)} onChange={()=>setSelectedCells(previous=>selectSupportPrintCell(previous,cell.key,true))} className="h-4 w-4 accent-emerald-600"/>{cell.label}</label>)}
            </div>
            <label className="flex items-center justify-between text-sm">文字サイズ
              <span><input aria-label="選択したマスの文字サイズ" type="number" min={5} max={24} step={0.5} disabled={!validSelected.length} value={commonSize} placeholder={validSelected.length?'複数':''} onChange={event=>{if(event.target.value)setSize(Number(event.target.value));}} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right disabled:opacity-40"/> pt</span>
            </label>
            {validSelected.length>1&&commonSize===''&&<p className="text-xs text-slate-500">異なる文字サイズが含まれています。変更すると選択したマスすべてに適用します。</p>}
            <input aria-label="文字サイズをスライダーで調整" type="range" min={5} max={24} step={0.5} disabled={!validSelected.length} value={commonSize||sizes[0]||9} onChange={event=>setSize(Number(event.target.value))} className="w-full accent-emerald-600 disabled:opacity-40"/>
            {overflow.length > 0 && <p role="status" className="rounded-lg bg-orange-50 p-2 text-xs text-orange-800">文字が見切れるマス：{overflow.length}か所（オレンジ枠）</p>}
          </section>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        </aside>
        <div ref={previewArea} className="min-h-[400px] min-w-0 flex-1 overflow-auto bg-slate-200 p-3">
          <div className="mx-auto" style={{width: page.width * 96 / 25.4 * scale, height: page.height * pageCount * 96 / 25.4 * scale, position: 'relative'}}>
            <iframe ref={frame} title={title+'のリアルタイムプレビュー'} sandbox="allow-scripts" srcDoc={html} onLoad={()=>{frame.current?.contentWindow?.postMessage({type:'support-print-measure'},'*');frame.current?.contentWindow?.postMessage({type:'support-print-selection',keys:selectedCellsRef.current},'*');}}
              style={{width: `${page.width}mm`, height: `${page.height*pageCount}mm`, border: 0, position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: 'white', boxShadow: '0 2px 12px #0002'}} />
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t bg-slate-50 px-4 py-3">
        <button type="button" disabled={printing} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600">閉じる</button>
        <button type="button" disabled={printing || !selectedRows.length || (!isProfessional && !isBatch && selectedRows.length > 6) || batchOverLimit} onClick={async () => {
          setPrinting(true); setError('');
          try {if(isProfessional)await printProfessionalDocuments(selectedDocuments,settings);else if(isBatch)await printSupportBatch(selectedBatch,settings);else await printSupportDocument(documentData!,rows.filter(row=>selected.has(row.key)),settings);} catch (error) {setError(error instanceof Error ? error.message : '印刷画面を開けませんでした。');} finally {setPrinting(false);}
        }} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Printer size={16} />{printing ? '印刷画面を準備中…' : '印刷する'}</button>
      </footer>
    </section>
  </ViewportModal>;
}
