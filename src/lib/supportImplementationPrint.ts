import {PRINT_PREVIEW_SCRIPT,printPreviewHtml} from './printPreview';
import type {DailyReport} from '../types/supportPlan';
import {supportDateKey} from './supportOfficeAttendance';

export type SupportPrintRow = {
  key: string; date: string; supportContent: string; resultInfo: string; futurePlan: string; verified: boolean;
};
export type SupportPrintDocument = {
  childName: string; officeName: string; month: string; goals: string; creator: string; createdDate: string;
};
export type SupportPrintSettings = {goalHeight: number; fonts: Record<string, number>; selectedCell: string; selectedCells?: string[];previewSelectedRows?:string[];professionalSignDates?:{draft:boolean;final:boolean}};
export const PRINT_FIELDS = ['date', 'supportContent', 'resultInfo', 'futurePlan'] as const;
export const PRINT_LABELS = {date: '日付', supportContent: '療育内容', resultInfo: '療育を行った結果', futurePlan: '今後の予定'};
export const SUPPORT_PRINT_PAGE = {width: 210, height: 297, margin: 8, contentWidth: 194, contentHeight: 280} as const;
export const cellFontSize = (fonts: Record<string, number>, key: string) => Math.max(5, Math.min(24, Number(fonts[key]) || (key.endsWith(':date') ? 13 : 9)));
export function selectSupportPrintCell(current:string[], key:string, additive:boolean):string[] {
  return additive ? current.includes(key) ? current.filter(item=>item!==key) : [...current,key] : [key];
}
export function applySupportPrintFontSize(fonts:Record<string,number>, keys:string[], value:number):Record<string,number> {
  if(!Number.isFinite(value) || !keys.length) return fonts;
  const next={...fonts};
  for(const key of keys) next[key]=Math.max(5,Math.min(24,value));
  return next;
}
export function supportPrintLayout(goalHeight: number) {
  const goals = Math.max(24, Math.min(85, Number(goalHeight) || 40));
  // A4縦の上下8mm余白と、改ページ誤差の余裕1mmを除いた領域に6日分を収める。
  const tableHeight = SUPPORT_PRINT_PAGE.contentHeight - 22 - goals - 6 - 16 - 8;
  const rowHeight = (tableHeight - 8 - 2 * 25.4 / 96) / 6;
  return {goalHeight: goals, rowHeight, tableHeight};
}
export function prepareSupportPrintRows(rows: DailyReport[], month: string): SupportPrintRow[] {
  const dates = new Map<string, SupportPrintRow>();
  const join = (a: string, b: string) => !b || a === b ? a : !a ? b : `${a}\n\n${b}`;
  for (const row of rows) {
    if (row.archived) continue;
    const date = supportDateKey(row.date, month);
    if (!date) continue;
    const day = Number(date.match(/月(\d+)日/)![1]);
    const key = `${month}-${String(day).padStart(2, '0')}`;
    const next: SupportPrintRow = {key, date, supportContent: (row.content.supportContent || []).join('\n'),
      resultInfo: row.content.resultInfo || '', futurePlan: row.content.futurePlan || '', verified: row.content.isVerified === true};
    const existing = dates.get(key);
    if (existing) {
      for (const field of ['supportContent', 'resultInfo', 'futurePlan'] as const) existing[field] = join(existing[field], next[field]);
      existing.verified &&= next.verified;
    } else dates.set(key, next);
  }
  return [...dates.values()].sort((a, b) => a.key.localeCompare(b.key));
}
const escape = (value: string) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]!));

/** プレビューと実際の印刷に同じHTML・寸法・文字サイズを使う。 */
export function supportPrintHtml(document: SupportPrintDocument, rows: SupportPrintRow[], settings: SupportPrintSettings, interactive = false): string {
  if (rows.length > 6) throw new Error('印刷できるのは最大6日分です。');
  const layout = supportPrintLayout(settings.goalHeight);
  const cell = (key: string, text: string, extra = '') => `<div class="print-cell ${extra} ${interactive && (settings.selectedCells || [settings.selectedCell]).includes(key) ? 'selected' : ''}" data-cell="${escape(key)}" ${interactive ? 'tabindex="0" role="button"' : ''}><div class="cell-text" style="font-size:${cellFontSize(settings.fonts, key)}pt">${escape(text)}</div></div>`;
  const slots = Array.from({length: 6}, (_, index) => {
    const row = rows[index];
    const check=interactive&&settings.previewSelectedRows&&row?`<label class="row-print-toggle" title="${escape(row.date)}を印刷"><input type="checkbox" data-print-row="${escape(row.key)}" aria-label="${escape(row.date)}を印刷" ${settings.previewSelectedRows.includes(row.key)?'checked':''}/></label>`:'';
    return `<div class="day-row${row&&settings.previewSelectedRows&&!settings.previewSelectedRows.includes(row.key)?' day-excluded':''}">${PRINT_FIELDS.map(field => row ? cell(`${row.key}:${field}`, field === 'date' ? row.date.replace(/^\d+月/, '') : row[field], field === 'date' ? 'date-cell' : '') : '<div class="print-cell blank"></div>').join('')}${check}</div>`;
  }).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>専門的支援実施計画</title><style>
    @page {size:A4 portrait;margin:${SUPPORT_PRINT_PAGE.margin}mm;}
    * {box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    html,body {margin:0;padding:0;background:white;color:#111;font-family:"Noto Sans JP","Yu Gothic",sans-serif;}
    #paper {width:${SUPPORT_PRINT_PAGE.width}mm;height:${SUPPORT_PRINT_PAGE.height}mm;padding:8mm 8mm 9mm;display:grid;grid-template-rows:22mm ${layout.goalHeight}mm 6mm ${layout.tableHeight}mm 16mm;row-gap:2mm;overflow:hidden;}
    header {overflow:hidden;}
    h1 {font-size:16pt;text-align:center;margin:0 0 1mm;line-height:1.3;}
    .office {font-size:10pt;line-height:1.2;text-align:center;}
    .identity {font-size:14pt;line-height:1.2;margin-top:1.5mm;}
    .goals {display:grid;grid-template-columns:17mm minmax(0,1fr);border:1px solid #333;overflow:hidden;}
    .goal-label {font-size:9pt;text-align:center;padding:2mm 1mm;background:#f1f5f9;border-right:1px solid #333;}
    .print-cell {position:relative;min-height:0;min-width:0;overflow:hidden;background:white;}
    .cell-text {position:absolute;inset:1.5mm;line-height:1.25;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere;}
    .date-cell .cell-text {display:flex;align-items:center;justify-content:center;}
    .records {border:1px solid #333;overflow:hidden;}
    .table-heading,.day-row {display:grid;grid-template-columns:8% 22% 40% 30%;}
    .table-heading {height:8mm;background:#f1f5f9;font-size:9pt;font-weight:bold;text-align:center;}
    .table-heading>div {display:flex;align-items:center;justify-content:center;border-right:1px solid #333;}
    .period {display:flex;align-items:center;font-size:11pt;line-height:1.2;font-weight:bold;}
    .day-row {height:${layout.rowHeight}mm;border-top:1px solid #333;}
    .day-row>.print-cell {border-right:1px solid #333;}
    .day-row>:last-child,.table-heading>:last-child {border-right:0;}
    footer {font-size:9pt;line-height:1.7;overflow:hidden;}
    .guardian {text-align:right;}
    @media screen { .records{overflow:visible;} .day-row{position:relative;} .row-print-toggle{position:absolute;right:-7mm;top:0;bottom:0;width:6mm;display:flex;align-items:center;justify-content:center;} .row-print-toggle input{width:4mm;height:4mm;accent-color:#059669;cursor:pointer;} .day-excluded>.print-cell{opacity:.35;} [role=button] {cursor:pointer;} .selected {background:#eff6ff;box-shadow:inset 0 0 0 2px #2563eb;} .overflowing {outline:2px dashed #ea580c;outline-offset:-2px;} }
    @media print {
      .row-print-toggle{display:none;}
      html,body {width:${SUPPORT_PRINT_PAGE.contentWidth}mm;height:${SUPPORT_PRINT_PAGE.contentHeight}mm;}
      #paper {width:100%;max-width:${SUPPORT_PRINT_PAGE.contentWidth}mm;height:${SUPPORT_PRINT_PAGE.contentHeight}mm;padding:0;break-inside:avoid;}
    }
  </style></head><body><main id="paper">
    <header><h1>専門的支援実施計画</h1><div class="office">${escape(document.officeName)}</div><div class="identity"><strong>${escape(document.childName)} 様</strong></div></header>
    <section class="goals"><div class="goal-label">支援目標</div>${cell('goals', document.goals)}</section>
    <div class="period">${escape(document.month.split('-')[0])}年${Number(document.month.split('-')[1])}月分</div>
    <section class="records"><div class="table-heading">${PRINT_FIELDS.map(field => `<div data-print-column="${field}" ${interactive?'role="button" tabindex="0" aria-label="'+PRINT_LABELS[field]+'の列を選択"':''}>${PRINT_LABELS[field]}</div>`).join('')}</div>${slots}</section>
    <footer><div>${escape(document.createdDate)}　作成者：${escape(document.creator)}</div><div class="guardian">（保護者署名）________________________________</div></footer>
  </main>${interactive ? PRINT_PREVIEW_SCRIPT : ''}</body></html>`;
}

export async function printSupportDocument(documentData:SupportPrintDocument,rows:SupportPrintRow[],settings:SupportPrintSettings) {
  await printPreviewHtml(supportPrintHtml(documentData,rows,settings),'専門的支援実施計画の印刷',SUPPORT_PRINT_PAGE);
}

export type SupportPrintBatchDocument={key:string;documentData:SupportPrintDocument;rows:SupportPrintRow[]};
export function supportBatchPrintHtml(documents:SupportPrintBatchDocument[],settings:SupportPrintSettings,interactive=false):string {
  const rendered=documents.map(doc=>supportPrintHtml(doc.documentData,doc.rows,{...settings,fonts:{...settings.fonts,goals:settings.fonts[doc.key+':goals']}},false));
  const styles=rendered[0]?.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
  let pages=rendered.map((html,index)=>html.match(/<body>([\s\S]*?)<\/body>/)![1].replace('id="paper"','class="batch-paper"'+(index===0?' id="paper"':'')).replace('data-cell="goals"','data-cell="'+escape(documents[index].key+':goals')+'"')).join('');
  if(interactive)pages=pages.replace(/data-print-column="([^"]*)"/g,'data-print-column="$1" role="button" tabindex="0"').replace(/data-cell="([^"]*)"/g,'data-cell="$1" role="button" tabindex="0"');
  // All pages share the individual print layout; each child always starts a new sheet.
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>専門的支援実施計画 一括印刷</title><style>'+styles.replaceAll('#paper','.batch-paper')+' .batch-paper{break-after:page;} .batch-paper:last-of-type{break-after:auto;} @media print{html,body{height:auto;}}'+(interactive?' [data-cell]{cursor:pointer;}':'')+'</style></head><body>'+pages+(interactive?PRINT_PREVIEW_SCRIPT:'')+'</body></html>';
}
export async function printSupportBatch(documents:SupportPrintBatchDocument[],settings:SupportPrintSettings){
  if(!documents.length)throw new Error('印刷する児童を選択してください。');
  await printPreviewHtml(supportBatchPrintHtml(documents,settings),'専門的支援実施計画の一括印刷',SUPPORT_PRINT_PAGE);
}

/** 除外した日も再選択できるよう、プレビューだけは全日を6日ずつ表示する。 */
export function supportSelectionPreviewHtml(documents:SupportPrintBatchDocument[],settings:SupportPrintSettings,selectedRows:string[]){
  const rendered:string[]=[];
  for(const document of documents){
    for(let start=0;start<Math.max(1,document.rows.length);start+=6){
      const goalKey=document.key?document.key+':goals':'goals';
      let html=supportPrintHtml(document.documentData,document.rows.slice(start,start+6),{...settings,previewSelectedRows:selectedRows,fonts:{...settings.fonts,goals:settings.fonts[goalKey]}},true);
      html=html.replace('data-cell="goals"','data-cell="'+escape(goalKey)+'"');rendered.push(html);
    }
  }
  const styles=rendered[0]?.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
  const pages=rendered.map((html,index)=>html.match(/<body>([\s\S]*?)<\/body>/)![1].replace(/<script>[\s\S]*?<\/script>/g,'').replace('id="paper"','class="preview-paper"'+(index===0?' id="paper"':''))).join('');
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>'+styles.replaceAll('#paper','.preview-paper')+'</style></head><body>'+pages+PRINT_PREVIEW_SCRIPT+'</body></html>';
}
