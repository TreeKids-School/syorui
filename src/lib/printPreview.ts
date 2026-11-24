export const PRINT_PREVIEW_SCRIPT = `<script>
    const cells = [...document.querySelectorAll('[data-cell]')];
    for (const cell of cells) {
      const select = event => parent.postMessage({type:'support-print-select',key:cell.dataset.cell,additive:!!(event.ctrlKey||event.metaKey)},'*');
      cell.addEventListener('click',select);
      cell.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(event);}});
    }
    const columns=[...document.querySelectorAll('[data-print-column]')];
    const columnCells=column=>[...column.closest('.records').querySelectorAll('[data-cell]')].filter(cell=>cell.dataset.cell.endsWith(':'+column.dataset.printColumn));
    for(const column of columns){
      const select=()=>parent.postMessage({type:'support-print-select-column',keys:columnCells(column).map(cell=>cell.dataset.cell)},'*');
      column.addEventListener('click',select);
      column.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
    }
    for(const input of document.querySelectorAll('[data-print-row]'))input.addEventListener('change',()=>parent.postMessage({type:'support-print-row',key:input.dataset.printRow,checked:input.checked},'*'));
    function measure() {
      const keys = [];
      for (const cell of cells) {
        const text=cell.querySelector('.cell-text');
        const overflow=text.scrollHeight>text.clientHeight+1||text.scrollWidth>text.clientWidth+1;
        cell.classList.toggle('overflowing',overflow);
        if(overflow)keys.push(cell.dataset.cell);
      }
      parent.postMessage({type:'support-print-overflow',keys},'*');
    }
    document.fonts.ready.then(()=>requestAnimationFrame(measure));
    window.addEventListener('load',measure);
    window.addEventListener('message',event=>{if(event.source!==parent)return;
      if(event.data?.type==='support-print-measure')measure();
      if(event.data?.type==='support-print-selection'&&Array.isArray(event.data.keys)) {
        const selected=new Set(event.data.keys);
        for(const cell of cells){const active=selected.has(cell.dataset.cell);cell.classList.toggle('selected',active);cell.setAttribute('aria-pressed',String(active));}
        for(const column of columns){const members=columnCells(column);const active=members.length>0&&members.every(cell=>selected.has(cell.dataset.cell));column.classList.toggle('selected',active);column.setAttribute('aria-pressed',String(active));}
      }});
    const paper=document.getElementById('paper');
    if(paper)new ResizeObserver(measure).observe(paper);
  </script>`;

export async function printPreviewHtml(html:string,title:string,page:{width:number;height:number}) {
  const frame=document.createElement('iframe');frame.title=title;
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:'+page.width+'mm;height:'+page.height+'mm;border:0';
  document.body.appendChild(frame);
  try {const preview=frame.contentWindow;if(!preview)throw new Error('印刷画面を開けませんでした。');
    preview.document.open();preview.document.write(html);preview.document.close();await preview.document.fonts.ready;
    const ready=(preview as Window & {printLayoutReady?:Promise<void>}).printLayoutReady;
    if(ready)await ready;
    await new Promise<void>(resolve=>preview.requestAnimationFrame(()=>resolve()));
    preview.addEventListener('afterprint',()=>frame.remove(),{once:true});preview.focus();preview.print();
  } catch(error){frame.remove();throw error;}
}
