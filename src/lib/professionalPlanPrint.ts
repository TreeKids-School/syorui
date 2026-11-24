import type {ProfessionalPlanDoc,ServiceHoursPlan} from '../types/professionalPlan';
import type {SupportPrintSettings} from './supportImplementationPrint';
import {PRINT_PREVIEW_SCRIPT,printPreviewHtml} from './printPreview';
export type ProfessionalPrintDocument={key:string;label:string;childName:string;officeName:string;plan?:ProfessionalPlanDoc;hoursPlan?:ServiceHoursPlan};
export const PROFESSIONAL_PRINT_PAGE={width:297,height:210,margin:8,contentWidth:281,contentHeight:194} as const;
const areas=['健康・生活','運動・感覚','認知・行動','言語・コミュニケーション','人間関係・社会性'];
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const rowLabels={supportGoal:'支援目標',supportContent:'支援内容',fiveAreas:'5領域',achievementPeriod:'達成時期',provider:'担当者・提供機関',notes:'留意事項',priority:'優先順位'};
export function professionalPrintCells(documents:ProfessionalPrintDocument[],settings:Pick<SupportPrintSettings,'professionalSignDates'>={}) {
  return documents.flatMap(doc=>{
    const fields:{key:string;label:string;value:string;size:number}[]=[];
    const add=(key:string,label:string,value:unknown,size=9)=>fields.push({key:doc.key+':'+key,label:doc.label+'・'+label,value:String(value??''),size});
    add('childName','児童氏名',doc.childName+' 様',12);
    add('createdAt',doc.hoursPlan?'開始年月日':'作成年月日',(doc.plan?.createdAt||doc.hoursPlan?.effectiveStartDate||doc.hoursPlan?.createdAt||'').replace(/-/g,'/'));
    if(doc.plan){const plan=doc.plan;
      for(const [field,label]of [['familyIntention','生活に対する意向'],['overallPolicy','総合的な支援の方針'],['longTermGoal','長期目標'],['shortTermGoal','短期目標'],['serviceHours','提供時間'],['confirmation','確認事項'],['managerName','管理責任者'],['guardianName','保護者署名']] as const)add(field,label,field==='managerName'||field==='guardianName'?String(plan[field]||'').replace(/(?:[\s　]*(?:印|㊞))+$/u,''):plan[field]);
      if(settings.professionalSignDates?.[plan.status==='draft'?'draft':'final']){
        const [year,month,day]=(plan.signDate||'').split('-');
        add('signDate','署名欄の日付',year&&month&&day?year+'年 '+Number(month)+'月 '+Number(day)+'日':'　　 年　 月　 日');
      }
      (plan.supportRows||[]).forEach((row,index)=>{for(const [field,label]of Object.entries(rowLabels)){if(field==='fiveAreas'&&row.category!=='本人支援')continue;add('row:'+index+':'+field,(index+1)+'行目・'+label,field==='fiveAreas'?areas.map(area=>((row.fiveAreas||[]).includes(area)?'☑ ':'□ ')+area).join('\n'):row[field as keyof typeof row],field==='fiveAreas'?6:9);}});
    } else if(doc.hoursPlan){const hours=doc.hoursPlan;
      for(const day of ['月','火','水','木','金','土','日']){const item=hours.weeklyHours?.[day];
        const extension=(Number(item?.beforeExtMinutes)||0)+(Number(item?.afterExtMinutes)||0);
        const minutes=(value:number)=>Math.floor(value/60)+'時間'+String(value%60).padStart(2,'0')+'分';
        const range=(start?:string,end?:string)=>start||end?(start||'')+'〜'+(end||''):'';
        add('day:'+day+':regular',day+'・利用時間',range(item?.startTime,item?.endTime));
        add('day:'+day+':before',day+'・支援前延長',range(item?.beforeExtStartTime,item?.beforeExtEndTime));
        add('day:'+day+':after',day+'・支援後延長',range(item?.afterExtStartTime,item?.afterExtEndTime));
        add('day:'+day+':regularTotal',day+'・合計時間',item&&(item.startTime||item.endTime)?minutes(Number(item.totalMinutes)||0):'');
        add('day:'+day+':extensionTotal',day+'・延長時間合計',item&&(item.beforeExtStartTime||item.beforeExtEndTime||item.afterExtStartTime||item.afterExtEndTime)?minutes(extension):'');
      }
      add('extReason','延長を必要とする理由',hours.extReason);add('notes','特記事項',hours.notes);
    }
    return fields;
  });
}
export function professionalPrintDefaultFonts(documents:ProfessionalPrintDocument[]) {return Object.fromEntries(professionalPrintCells(documents).map(cell=>[cell.key,cell.size]));}
export function professionalPrintHtml(documents:ProfessionalPrintDocument[],settings:SupportPrintSettings,interactive=false):string {
  const fields=new Map(professionalPrintCells(documents,settings).map(field=>[field.key,field]));
  const cell=(doc:ProfessionalPrintDocument,field:string,extra='')=>{
    const key=doc.key+':'+field,item=fields.get(key);const size=Math.max(5,Math.min(24,settings.fonts[key]||item?.size||9));
    const selected=interactive&&(settings.selectedCells||[settings.selectedCell]).includes(key);
    return `<div class="print-cell ${extra} ${selected?'selected':''}" data-cell="${escape(key)}" ${interactive?'role="button" tabindex="0"':''}><div class="cell-text" style="font-size:${size}pt">${escape(item?.value||'')}</div></div>`;
  };
  const label=(text:string)=>`<div class="label">${escape(text)}</div>`;
  const pages=documents.map((doc,index)=>{
    const variant=doc.plan?.variantIndex||doc.hoursPlan?.variantIndex||0;
    const header=`<header><div class="identity">${cell(doc,'childName')}</div><h1>${doc.plan?.status==='draft'?'(案)':''}${doc.plan?'個別支援計画書':'個別支援計画別表（利用時間）'}${variant?'（'+variant+'）':''}<small>（${escape(doc.officeName)}）</small></h1><div class="created"><span>${doc.hoursPlan?'開始年月日':'作成年月日'}</span>${cell(doc,'createdAt')}</div></header>`;
    if(doc.plan){const plan=doc.plan,supportRows=plan.supportRows||[],n=Math.max(1,supportRows.length);
      const overview=`<section class="overview">${label('利用児及び家族の\n生活に対する意向')}${cell(doc,'familyIntention','span-three')}${label('総合的な支援の方針')}${cell(doc,'overallPolicy','span-three')}${label('長期目標')}${cell(doc,'longTermGoal')}${label('支援の標準的な提供時間等\n（曜日・頻度・時間）').replace('class="label"','class="label two-rows"')}${cell(doc,'serviceHours','two-rows')}${label('短期目標')}${cell(doc,'shortTermGoal')}</section>`;
      const heads=['項目','支援目標\n（具体的な到達目標）','支援内容\n（支援のポイント・5領域との関連性）','達成時期','担当者・提供機関','留意事項\n（本人の役割を含む）','優先順位'].map(label).join('');
      const rows=supportRows.map((row,i)=>{
        let category='';if(i===0||supportRows[i-1].category!==row.category){let count=1;while(supportRows[i+count]?.category===row.category)count++;category=`<div class="label category" style="grid-row:span ${count}">${escape(row.category)}</div>`;}
        const content=row.category==='本人支援'?`<div class="content-with-areas">${cell(doc,'row:'+i+':supportContent')}${cell(doc,'row:'+i+':fiveAreas')}</div>`:cell(doc,'row:'+i+':supportContent');
        return category+cell(doc,'row:'+i+':supportGoal')+content+cell(doc,'row:'+i+':achievementPeriod')+cell(doc,'row:'+i+':provider')+cell(doc,'row:'+i+':notes')+cell(doc,'row:'+i+':priority');
      }).join('')||Array.from({length:7},()=>'<div class="empty"></div>').join('');
      const showSignDate=!!settings.professionalSignDates?.[plan.status==='draft'?'draft':'final'];
      const signature=`<footer><section><p>提供する支援内容について、本計画書に基づき説明しました。</p><div class="manager-signature ${showSignDate?'with-sign-date':''}"><div class="sign"><span>児童発達支援管理責任者</span>${cell(doc,'managerName')}<span>印</span></div>${showSignDate?cell(doc,'signDate','signature-date'):''}</div></section><section><p>本計画書に基づき支援の説明を受け、内容に同意しました。</p><div class="sign"><span>保護者署名</span>${cell(doc,'guardianName')}</div></section></footer>`;
      return `<main class="paper plan" ${index===0?'id="paper"':''}>${header}${overview}<div class="section-title">○支援目標及び具体的な支援内容等</div><section class="support-table" style="grid-template-rows:10mm repeat(${n},minmax(0,1fr))">${heads}${rows}</section><div class="area-note">※5領域：${areas.map(escape).join(' ／ ')}</div><section class="confirmation">${label('確認事項')}${cell(doc,'confirmation')}</section>${signature}</main>`;
    }
    const days=['月','火','水','木','金','土','日'];
    const dayCells=(field:string)=>days.map(day=>cell(doc,'day:'+day+':'+field,field.endsWith('Total')?'hours-total':'hours-time')).join('');
    const category=(text:string,span:number)=>label(text).replace('class="label"','class="label" style="grid-row:span '+span+'"');
    const hoursGrid=[
      ['区分','時間帯 / 合計',...days].map(label).join(''),
      category('提供時間',2)+label('利用開始・終了時間')+dayCells('regular'),
      label('合計時間')+dayCells('regularTotal'),
      '<div class="label extension-category" style="grid-row:span 3">延長支援時間<small>※延長支援時間は、支援前・支援後それぞれ1時間以上から</small></div>'+label('【支援前】延長支援時間')+dayCells('before'),
      label('【支援後】延長支援時間')+dayCells('after'),
      label('延長時間合計')+dayCells('extensionTotal'),
      label('延長を必要とする理由')+cell(doc,'extReason','hours-wide'),
      label('特記事項')+cell(doc,'notes','hours-wide'),
    ].join('');
    return `<main class="paper hours" ${index===0?'id="paper"':''}>${header}<section class="hours-table">${hoursGrid}</section></main>`;
  }).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>個別支援計画書の印刷</title><style>
  @page{size:A4 landscape;margin:8mm;}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}html,body{margin:0;padding:0;background:white;color:#111;font-family:"Noto Sans JP","Yu Gothic",sans-serif;}
  .paper{width:297mm;height:210mm;padding:8mm;display:grid;gap:1mm;overflow:hidden;break-after:page;break-inside:avoid;}.paper:last-child{break-after:auto;}.plan{grid-template-rows:12mm 44mm 5mm minmax(0,1fr) 4mm 10mm 22mm;}.hours{grid-template-rows:12mm minmax(0,1fr);}
  header{display:grid;grid-template-columns:65mm minmax(0,1fr) 49mm;gap:2mm;align-items:center;min-height:0;}h1{font-size:14pt;line-height:1.25;text-align:center;margin:0;}h1 small{font-size:9pt;font-weight:normal;}.identity{height:10mm;display:grid;grid-template-rows:minmax(0,1fr);min-width:0;}.created{display:grid;grid-template-rows:4mm 6mm;font-size:8pt;}
  .print-cell{position:relative;min-width:0;min-height:0;overflow:hidden;background:white;}.cell-text{position:absolute;inset:1.2mm;line-height:1.3;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere;}.label{font-size:8pt;font-weight:bold;line-height:1.25;white-space:pre-wrap;text-align:center;background:#eee;display:flex;align-items:center;justify-content:center;padding:1mm;min-width:0;min-height:0;overflow:hidden;}
  .overview{display:grid;grid-template-columns:16% 54% 16% 14%;grid-template-rows:repeat(4,minmax(0,1fr));border-left:1px solid #333;border-top:1px solid #333;}.overview>*{border-right:1px solid #333;border-bottom:1px solid #333;}.span-three{grid-column:span 3;}.two-rows{grid-row:span 2;}
  .section-title{font-size:9pt;display:flex;align-items:center;}.support-table{display:grid;grid-template-columns:7% 15% 38% 7% 11% 17% 5%;border-left:1px solid #333;border-top:1px solid #333;min-height:0;}.support-table>*{border-right:1px solid #333;border-bottom:1px solid #333;}.content-with-areas{display:grid;grid-template-columns:minmax(0,1fr) 27mm;min-height:0;min-width:0;}.content-with-areas>:last-child{border-left:1px solid #aaa;}.area-note{font-size:7pt;text-align:right;overflow:hidden;}
  .confirmation,.hours-note{display:grid;grid-template-columns:16% minmax(0,1fr);border:1px solid #333;min-height:0;}.confirmation>.label,.hours-note>.label{border-right:1px solid #333;}
  footer{display:grid;grid-template-columns:1fr 1fr;gap:5mm;font-size:8pt;min-height:0;overflow:hidden;}footer p{margin:0 0 1mm;}.sign{display:grid;grid-template-columns:auto minmax(0,1fr) 5mm;align-items:center;font-size:8pt;height:8mm;}.sign>.print-cell{height:8mm;border-bottom:1px solid #333;}.hours-table{display:grid;grid-template-columns:11% 11% repeat(7,minmax(0,1fr));grid-template-rows:10mm 20mm 12mm 20mm 20mm 12mm repeat(2,minmax(0,1fr));border-top:1px solid #333;border-left:1px solid #333;min-height:0;}.hours-table>*{border-right:1px solid #333;border-bottom:1px solid #333;}
  .hours-wide{grid-column:span 8;}.extension-category{flex-direction:column;gap:2mm;}.extension-category small{font-size:6pt;font-weight:normal;line-height:1.5;}.hours-time .cell-text,.hours-total .cell-text{text-align:center;display:flex;align-items:center;justify-content:center;}.hours-total{font-weight:bold;}
  .manager-signature.with-sign-date{display:grid;grid-template-columns:minmax(0,1fr) 47mm;gap:2mm;align-items:end;}.signature-date{height:8mm;}
  @media screen{[role=button]{cursor:pointer;}.selected{background:#eff6ff;box-shadow:inset 0 0 0 2px #2563eb;}.overflowing{outline:2px dashed #ea580c;outline-offset:-2px;}}
  @media print{html,body{width:281mm;}.paper{width:281mm;height:194mm;padding:0;}}
  </style></head><body>${pages}${interactive?PRINT_PREVIEW_SCRIPT:''}</body></html>`;
}
export async function printProfessionalDocuments(documents:ProfessionalPrintDocument[],settings:SupportPrintSettings){
  if(!documents.length)throw new Error('印刷する書類を選択してください。');
  await printPreviewHtml(professionalPrintHtml(documents,settings),'個別支援計画書の印刷',PROFESSIONAL_PRINT_PAGE);
}
