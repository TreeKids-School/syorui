import type {WorkSheet} from 'xlsx';

/** シート名ではなく、書類の表題に付いた「案」で取り込み先を決める。 */
export function professionalPlanSheetStatus(sheet:WorkSheet):{status:'draft'|'final';title:string} {
  const rows=new Map<number,{column:number;text:string}[]>();
  for(const [address,cell] of Object.entries(sheet)) {
    const match=address.match(/^([A-Z]+)(\d+)$/);
    if(!match || !cell || Number(match[2])>20) continue;
    const text=String(cell.w ?? cell.v ?? '').normalize('NFKC').replace(/[\s　]+/g,'');
    if(!text) continue;
    const row=Number(match[2]);
    const column=[...match[1]].reduce((value,char)=>value*26+char.charCodeAt(0)-64,0);
    rows.set(row,[...(rows.get(row)||[]),{column,text}]);
  }
  for(const [,cells] of [...rows].sort(([a],[b])=>a-b)) {
    const ordered=cells.sort((a,b)=>a.column-b.column);
    const titleCell=ordered.find(cell=>/(?:個別|専門的)支援計画(?:書)?/.test(cell.text));
    if(!titleCell) continue;
    const marker=ordered.filter(cell=>/^(?:\(案\)|【案】|\[案\]|案)$/.test(cell.text)).map(cell=>cell.text).join('');
    const title=marker+titleCell.text;
    const draft=/(?:\(案\)|【案】|\[案\])/.test(title) || /^案(?:個別|専門的)支援計画/.test(title);
    return {status:draft?'draft':'final',title:titleCell.text};
  }
  return {status:'final',title:''};
}
