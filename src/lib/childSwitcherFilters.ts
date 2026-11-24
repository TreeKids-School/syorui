import {orderSummaryChildren} from './summaryChildOrder';
import type {SummaryChildOrder} from './summaryChildOrder';
import type {Child} from '../data/mockData';
export const normalizeChildSearch=(value:string)=>value.normalize('NFKC').replace(/\s/g,'').toLowerCase().replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60));
export const KANA_ROWS=['あ','か','さ','た','な','は','ま','や','ら','わ'] as const;
export type KanaRow=typeof KANA_ROWS[number]|'all';
const groups=['あいうえおぁぃぅぇぉゔ','かきくけこがぎぐげごゕゖ','さしすせそざじずぜぞ','たちつてとだぢづでどっ','なにぬねの','はひふへほばびぶべぼぱぴぷぺぽ','まみむめも','やゆよゃゅょ','らりるれろ','わをんゎゐゑ'];
export function childKanaRow(child:Pick<Child,'nameKana'>):KanaRow|''{const first=normalizeChildSearch(child.nameKana||'')[0];const index=groups.findIndex(group=>!!first&&group.includes(first));return index<0?'':KANA_ROWS[index];}
export const CHILD_SWITCH_ORDERS:readonly {value:SummaryChildOrder;label:string}[]=[
  {value:'today',label:'本日来る児童のみ'},
  {value:'name-asc',label:'名前順（読み仮名・昇順）'},
  {value:'name-desc',label:'名前順（読み仮名・降順）'},
  {value:'staff',label:'スタッフごとにまとめる'},
  {value:'attendance-desc',label:'今月の出席が多い順'},
  {value:'attendance-asc',label:'今月の出席が少ない順'},
  {value:'original',label:'元の順番'},
];
export function filterSwitcherChildren(children:Child[],query:string,row:KanaRow,order:SummaryChildOrder,context:Parameters<typeof orderSummaryChildren>[2]){
  const search=normalizeChildSearch(query);
  const unique=[...new Map(children.filter(child=>child.id&&!child.archived).map(child=>[child.id!,child])).values()];
  const filtered=unique.filter(child=>(normalizeChildSearch(child.fullName).includes(search)||normalizeChildSearch(child.nameKana||'').includes(search))&&(row==='all'||childKanaRow(child)===row)&&(order!=='today'||context.attendingToday.has(child.id!)));
  return orderSummaryChildren(filtered,order,context);
}
