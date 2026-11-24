import ExcelJS from 'exceljs';
import type {ProfessionalPrintDocument} from './professionalPlanPrint';
import {cleanProfessionalManagerName} from './professionalManager';

const DAYS=['月','火','水','木','金','土','日'];
const minutes=(value:number)=>value?`${Math.floor(value/60)}時間${String(value%60).padStart(2,'0')}分`:'';
const range=(start?:string,end?:string)=>start||end?`${start||''} ～ ${end||''}`:'';
const safeName=(value:string)=>value.replace(/[\\/:*?"<>|]/g,'_');
/** Create a new workbook, without modifying an existing source workbook or app data. */
export function professionalPlanWorkbook(documents:ProfessionalPrintDocument[]){
  if(!documents.length)throw new Error('エクスポートする書類を選択してください。');
  const workbook=new ExcelJS.Workbook();
  for(const document of documents){
    const {plan,hoursPlan}=document;
    if(!plan&&!hoursPlan)continue;
    const month=(plan?.startMonth||hoursPlan?.startMonth||plan?.createdAt?.slice(0,7)||'').replace('-','');
    const variant=plan?.variantIndex||hoursPlan?.variantIndex||0;
    const base=(hoursPlan?'利用時間':month+(plan?.status==='draft'?'案':''))+(variant?` (${variant})`:'');
    let name=base.slice(0,31)||'計画書',number=1;
    while(workbook.getWorksheet(name))name=base.slice(0,25)+` (${number++})`;
    const sheet=workbook.addWorksheet(name,{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:0.25,right:0.25,top:0.25,bottom:0.25,header:0,footer:0}}});
    const count=hoursPlan?9:8;
    sheet.columns=(hoursPlan?[18,23,17,17,17,17,17,17,17]:[14,34,44,25,15,24,32,12]).map(width=>({width}));
    const merged=(row:number,start:number,end:number,text:string)=>{if(end>start)sheet.mergeCells(row,start,row,end);sheet.getCell(row,start).value=text;};
    merged(1,1,count,`${plan?.status==='draft'?'(案)':''}${hoursPlan?'個別支援計画別表（利用時間）':'個別支援計画書'}（${document.officeName}）`);
    sheet.getRow(1).height=30;sheet.getCell(1,1).font={name:'Yu Gothic',size:16,bold:true};sheet.getCell(1,1).alignment={horizontal:'center',vertical:'middle'};
    merged(2,1,2,'利用児氏名');merged(2,3,count,document.childName);
    merged(3,1,2,plan?.status==='draft'?'作成年月日':'開始年月日');merged(3,3,count,hoursPlan?.effectiveStartDate||hoursPlan?.createdAt||plan?.createdAt||'');
    if(plan){
      const fields=[['利用児及び家族の生活に対する意向',plan.familyIntention],['総合的な支援の方針',plan.overallPolicy],['長期目標',plan.longTermGoal],['短期目標',plan.shortTermGoal],['支援の標準的な提供時間等',plan.serviceHours]];
      fields.forEach(([label,value],index)=>{const row=index+5;merged(row,1,2,label);merged(row,3,8,value||'');sheet.getRow(row).height=index<2?52:40;});
      sheet.getRow(11).values=['項目','支援目標','支援内容','5領域','達成時期','担当者・提供機関','留意事項','優先順位'];
      let row=12;
      for(const item of plan.supportRows||[]){sheet.getRow(row).values=[item.category,item.supportGoal,item.supportContent,(item.fiveAreas||[]).join('\n'),item.achievementPeriod,item.provider,item.notes,item.priority];sheet.getRow(row++).height=76;}
      row++;merged(row,1,2,'確認事項');merged(row,3,8,plan.confirmation||'');sheet.getRow(row++).height=38;
      merged(row,1,2,'児童発達支援管理責任者氏名');merged(row++,3,8,cleanProfessionalManagerName(plan.managerName));
      merged(row,1,2,'保護者署名');merged(row++,3,8,plan.guardianName||'');
      merged(row,1,2,'同意年月日');merged(row,3,8,plan.signDate||'');
    }else if(hoursPlan){
      sheet.getRow(5).values=['区分','時間帯／合計',...DAYS];
      const definitions=[['提供時間','利用開始・終了時間',(day:string)=>{const value=hoursPlan.weeklyHours[day];return value?range(value.startTime,value.endTime):'';}],['','合計時間',(day:string)=>minutes(hoursPlan.weeklyHours[day]?.totalMinutes||0)],['延長支援時間','【支援前】延長支援時間',(day:string)=>{const value=hoursPlan.weeklyHours[day];return value?range(value.beforeExtStartTime,value.beforeExtEndTime):'';}],['','【支援後】延長支援時間',(day:string)=>{const value=hoursPlan.weeklyHours[day];return value?range(value.afterExtStartTime,value.afterExtEndTime):'';}],['','延長時間合計',(day:string)=>{const value=hoursPlan.weeklyHours[day];return minutes((value?.beforeExtMinutes||0)+(value?.afterExtMinutes||0));}]] as const;
      definitions.forEach(([label,sub,value],index)=>{sheet.getRow(index+6).values=[label,sub,...DAYS.map(value)];sheet.getRow(index+6).height=42;});
      sheet.mergeCells('A6:A7');sheet.mergeCells('A8:A10');
      merged(12,1,2,'延長を必要とする理由');merged(12,3,9,hoursPlan.extReason||'');sheet.getRow(12).height=62;
      merged(13,1,2,'特記事項');merged(13,3,9,hoursPlan.notes||'');sheet.getRow(13).height=62;
    }
    for(let row=2;row<=sheet.rowCount;row++)for(let col=1;col<=count;col++){
      const cell=sheet.getCell(row,col);if(cell.isMerged&&cell.master.address!==cell.address)continue;
      if(cell.value===null)continue;
      cell.font={name:'Yu Gothic',size:10};cell.alignment={vertical:'top',wrapText:true};
      cell.border={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
      if((hoursPlan&&row===5)||(!hoursPlan&&row===11)){cell.font={name:'Yu Gothic',size:10,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};}
    }
    sheet.pageSetup.printArea=`A1:${hoursPlan?'I':'H'}${sheet.rowCount}`;
  }
  return workbook;
}
export async function downloadProfessionalDocuments(documents:ProfessionalPrintDocument[],childName:string,month:string){
  const buffer=await professionalPlanWorkbook(documents).xlsx.writeBuffer();
  const blob=new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=safeName(`個別支援計画書_${childName}_${month}`)+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
