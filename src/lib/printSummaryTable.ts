import {printPreviewHtml} from './printPreview';
export type SummaryPrintOptions = {
  fontSize?: number;
  nameFontSize?: number;
  year: number;
  month: number;
  orientation: 'landscape' | 'portrait';
  alignment: 'left' | 'center' | 'right';
  stripeEvenColumns: boolean;
  repeatDateMiddle: boolean;
  repeatDateRight: boolean;
  excludeZeroAttendance: boolean;
  zeroAttendanceChildIds?: string[];
};

/** 印刷用の複製だけから児童を除外する。縦横どちらの表にも対応。 */
export const filterSummaryPrintChildren = (table: HTMLTableElement, excludedChildIds: string[]): number => {
  const excluded = new Set(excludedChildIds);
  if (table.dataset.tableOrientation === 'children-rows') {
    const body = table.tBodies[0];
    if (!body) return 0;
    for (let index = body.rows.length - 1; index >= 0; index--) {
      if (excluded.has(body.rows[index].cells[0]?.dataset.printChildId || '')) body.deleteRow(index);
    }
    Array.from(body.rows).forEach((row, index) => Array.from(row.cells).forEach(cell => {
      cell.dataset.evenColumn = String(index % 2 === 1);
    }));
    return body.rows.length;
  }
  const heading = table.tHead?.rows[0];
  if (!heading) return 0;
  const indices = Array.from(heading.cells).flatMap((cell, index) => excluded.has(cell.dataset.printChildId || '') ? [index] : []);
  const columns = table.querySelector('colgroup');
  for (const index of indices.reverse()) {
    for (const row of Array.from(table.rows)) if (row.cells[index]) row.deleteCell(index);
    columns?.children[index]?.remove();
  }
  for (const row of Array.from(table.rows)) Array.from(row.cells).forEach((cell, index) => {
    if (index) cell.dataset.evenColumn = String((index - 1) % 2 === 1);
  });
  if (columns) {
    const width = Array.from(columns.children).reduce((sum, col) => sum + (parseFloat((col as HTMLElement).style.width) || 40), 0);
    table.style.width = `${width}px`;
  }
  return heading.cells.length - 1;
};

export const repeatSummaryDateColumns = (table: HTMLTableElement, options: Pick<SummaryPrintOptions, 'repeatDateMiddle' | 'repeatDateRight'>) => {
  if (table.dataset.tableOrientation === 'children-rows') {
    const heading = table.tHead?.rows[0];
    const body = table.tBodies[0];
    if (!heading || !body) return;
    const middle = body.rows[Math.ceil(body.rows.length / 2)] ?? null;
    if (options.repeatDateMiddle) body.insertBefore(heading.cloneNode(true), middle);
    if (options.repeatDateRight) body.appendChild(heading.cloneNode(true));
    return;
  }
  const columns = table.querySelector('colgroup');
  const childCount = table.rows[0]?.cells.length - 1;
  if (!columns || !childCount || childCount < 0) return;
  const middleIndex = 1 + Math.ceil(childCount / 2);
  const firstCol = columns.children[0];
  const middleCol = columns.children[middleIndex] ?? null;
  const dateWidth = parseFloat((firstCol as HTMLElement).style.width) || 80;
  for (const row of Array.from(table.rows)) {
    const first = row.cells[0];
    if (!first) continue;
    const middleCell = row.cells[middleIndex] ?? null;
    const makeDateCell = () => {
      const cell = first.cloneNode(true) as HTMLTableCellElement;
      cell.removeAttribute('data-even-column');
      cell.removeAttribute('data-adopted');
      if (row === table.tHead?.rows[0]) cell.textContent = '日付';
      return cell;
    };
    if (options.repeatDateMiddle) row.insertBefore(makeDateCell(), middleCell);
    if (options.repeatDateRight) row.appendChild(makeDateCell());
  }
  if (options.repeatDateMiddle) columns.insertBefore(firstCol.cloneNode(true), middleCol);
  if (options.repeatDateRight) columns.appendChild(firstCol.cloneNode(true));
  const addedCount = Number(options.repeatDateMiddle) + Number(options.repeatDateRight);
  const originalWidth = parseFloat(table.style.width) || dateWidth + childCount * 40;
  table.style.width = `${originalWidth + dateWidth * addedCount}px`;
};

export function summaryPrintPage(orientation:SummaryPrintOptions['orientation']) {
  return orientation==='portrait'?{width:297,height:420}:{width:420,height:297};
}
/** プレビューと実際の印刷に、同じ表の複製・設定・縮小計算を使う。 */
export function summaryPrintHtml(table:HTMLTableElement,options:SummaryPrintOptions):string {
  const copy=table.cloneNode(true) as HTMLTableElement;
  if(options.excludeZeroAttendance&&filterSummaryPrintChildren(copy,options.zeroAttendanceChildIds||[])===0)throw new Error('出席のある児童がいないため、印刷対象がありません。');
  copy.dataset.stripeEvenColumns=String(options.stripeEvenColumns);
  repeatSummaryDateColumns(copy,options);
  copy.querySelectorAll('[data-print-exclude]').forEach(element=>element.remove());
  copy.querySelectorAll('th').forEach(element=>{if(element.dataset.printBackground)element.style.backgroundColor=element.dataset.printBackground;});
  const heading=table.ownerDocument.createElement('h1');
  heading.textContent=options.year+'年'+options.month+'月分　支援実施状況';
  const portrait=options.orientation==='portrait';
  const basePixels=Math.max(5,Math.min(24,Number(options.fontSize)||9))*4/3;
  const namePixels=Math.max(5,Math.min(24,Number(options.nameFontSize)||10.5))*4/3;
  return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><title>月間支援実施状況</title>
    <style>
      @page { size: A3 ${portrait ? 'portrait' : 'landscape'}; margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; padding: 0; background: white; color: #111827; font-family: "Noto Sans JP", "Yu Gothic", sans-serif; }
      #sheet { display: flex; flex-direction: column; width: ${portrait ? 297 : 420}mm; height: ${portrait ? 419 : 296}mm; padding: 8mm; overflow: hidden; }
      h1 { flex-shrink: 0; margin: 0 0 4mm; font-size: 18px; font-weight: bold; line-height: 1.4; }
      #print-area { flex: 1; min-height: 0; overflow: hidden; }
      #content { position: relative; width: max-content; transform-origin: top left; }
      table { table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
      th, td { position: static !important; border: 1px solid #94a3b8; padding: 0; text-align: center; vertical-align: middle; font-size: ${basePixels}px; line-height: 1.3; }
      th { padding: 2px; overflow-wrap: anywhere; }
      [data-print-child-id] { font-weight: 700; }
      [data-print-child-id] > div, [data-print-child-id] a {
        font-size: inherit !important; line-height: 1.25 !important; font-weight: 700;
      }
      td { height: 40px; }
      td > div, td > button, td > a { width: 100%; height: 40px; display: flex; align-items: center; justify-content: center; }
      button, a { color: inherit; font: inherit; text-decoration: none; border: 0; background: transparent; padding: 0; }
      svg { display: none; }
      [aria-label="今後の予定あり"] { color: #15803d; font-weight: bold; font-size: ${basePixels*4/3}px; }
      [aria-label="出席予定あり"] { font-size: 16px; }
      td[data-adopted="true"] { outline: 3px solid #059669; outline-offset: -3px; background: #ecfdf5 !important; }
      td[data-adopted="true"] > button, td[data-adopted="true"] > a { background: #ecfdf5 !important; }
      table[data-stripe-even-columns="true"] th[data-even-column="true"],
      table[data-stripe-even-columns="true"] td[data-even-column="true"]:not([data-adopted="true"]) > button,
      table[data-stripe-even-columns="true"] td[data-even-column="true"]:not([data-adopted="true"]) > a,
      table[data-stripe-even-columns="true"] td[data-even-column="true"]:not([data-adopted="true"]) > div {
        background-image: linear-gradient(rgba(59,130,246,.09), rgba(59,130,246,.09));
      }
      [data-staff-icon] { display: inline-block; width: 12px; height: 12px; flex-shrink: 0; border-radius: 50%; margin-right: 2px; }
      tr { break-inside: avoid; }
    </style></head><body><div id="sheet">${heading.outerHTML}<div id="print-area"><div id="content">${copy.outerHTML}</div></div></div><script>
    const namePixels=${namePixels};
    function layoutSummary(){
  const area = document.getElementById('print-area');
  const content = document.getElementById('content');
  const printedTable = content.querySelector('table');
  const names = Array.from(printedTable.querySelectorAll('[data-print-child-id]'));
  const getScale = () => Math.min(1, area.clientWidth / printedTable.offsetWidth,
    area.clientHeight / printedTable.offsetHeight) * 0.995;
  // 縮小前の12pxをそのまま使わず、用紙上で約10.5ptになる大きさを目指す。
  // 名前を拡大すると表の高さも変わるため、再計測して一枚に収める。
  for (let pass = 0; pass < 6; pass++) {
    const scale = getScale();
    let changed = false;
    for (const name of names) {
      const vertical = window.getComputedStyle(name.firstElementChild || name).writingMode.startsWith('vertical');
      const fontSize = Math.max(12, Math.min(72, namePixels / scale, vertical ? name.clientWidth - 6 : 72));
      if (Math.abs(parseFloat(name.style.fontSize || '0') - fontSize) > 0.25) {
        name.style.fontSize = \`\${fontSize}px\`;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const scale = getScale();
  content.style.transform = \`scale(\${scale})\`;
  const remainingWidth = Math.max(0, area.clientWidth - printedTable.offsetWidth * scale);
  const alignment = ${JSON.stringify(options.alignment || 'center')};
  content.style.left = \`\${alignment === 'right' ? remainingWidth : alignment === 'center' ? remainingWidth / 2 : 0}px\`;

    }
    window.printLayoutReady=document.fonts.ready.then(()=>new Promise((resolve,reject)=>requestAnimationFrame(()=>{try{layoutSummary();resolve();}catch(error){reject(error);}})));
    window.printLayoutReady.catch(error=>parent.postMessage({type:'summary-print-error',message:error.message},'*'));
    document.addEventListener('click',event=>{if(event.target.closest('a,button,input'))event.preventDefault();});
  </script></body></html>`;
}
export async function printSummaryTable(table:HTMLTableElement,options:SummaryPrintOptions) {
  await printPreviewHtml(summaryPrintHtml(table,options),'実施状況の印刷用テーブル',summaryPrintPage(options.orientation));
}
