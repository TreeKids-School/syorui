export type DocumentType='professional'|'implementation'|'force';
export const documentTypes:readonly {value:DocumentType;label:string}[]=[
  {value:'professional',label:'個別支援計画書'},
  {value:'implementation',label:'専門的支援実施計画'},
  {value:'force',label:'強行シート'},
];
const colors={professional:'text-violet-600',implementation:'text-emerald-600',force:'text-orange-600'};
/** 20px向け。角丸の書類枠と最小限の区切りだけを使う単色線画。 */
export function DocumentIcon({type,size=20,tone='document',className=''}:{type:DocumentType;size?:number;tone?:'document'|'inherit';className?:string}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={'shrink-0 '+(tone==='document'?colors[type]:'')+' '+className}>
    {type==='professional'?<>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 8h18M9 8v13M3 14h18"/>
    </>:type==='implementation'?<>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M7 7h10M3 11h18M8 11v10M3 16h18"/>
    </>:<>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M6 7h3M15 7h3M3 11h18M8.5 11v10M15.5 11v10M3 16h18"/>
    </>}
  </svg>;
}
