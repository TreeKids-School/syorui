import * as XLSX from 'xlsx';
export type TransferBook='implementation'|'professional';
export type TransferKind='supportPlans'|'daily_reports'|'professionalPlans'|'serviceHoursPlans';
export type TransferRecord={kind:TransferKind;id:string;childId:string;childName:string;officeId:string;month:string;data:Record<string,any>};
export const transferBook=(kind:TransferKind):TransferBook=>kind==='supportPlans'||kind==='daily_reports'?'implementation':'professional';
const common=['archived','createdAt'];
export const TRANSFER_FIELDS:Record<TransferKind,string[]>={
  supportPlans:['goals','author','excludedDates','createdAt'],
  daily_reports:[...common,'date','staffId','staffName','type','content.externalInfo','content.supportContent','content.resultInfo','content.futurePlan','content.isVerified'],
  professionalPlans:[...common,'status','variantIndex','isPrimary','familyIntention','overallPolicy','longTermGoal','shortTermGoal','serviceHours','supportRows','confirmation','managerName','signDate','guardianName'],
  serviceHoursPlans:[...common,'variantIndex','isPrimary','effectiveStartDate','weeklyHours','extReason','notes'],
};
const jsonFields=new Set(['excludedDates','content.supportContent','supportRows','weeklyHours']);
const boolFields=new Set(['archived','isPrimary','content.isVerified']);
const read=(data:Record<string,any>,path:string):any=>path.split('.').reduce<any>((value,key)=>value?.[key],data);
const put=(data:Record<string,any>,path:string,value:any)=>{const parts=path.split('.');if(parts.length===2)(data[parts[0]]??={})[parts[1]]=value;else data[path]=value;};
export function plainTransferValue(value:any):any{
  if(value?.toDate)return value.toDate().toISOString();
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(plainTransferValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['__proto__','constructor','prototype'].includes(key)).map(([key,value])=>[key,plainTransferValue(value)]));
  return value;
}
export function cleanTransferData(kind:TransferKind,input:Record<string,any>):Record<string,any>{
  const result:Record<string,any>={};
  for(const field of TRANSFER_FIELDS[kind]){
    const raw=read(input,field);
    let value=plainTransferValue(raw);if(value===undefined)continue;
    if(field==='date'&&(raw instanceof Date||typeof raw?.toDate==='function'||typeof raw==='string'&&raw.includes('T'))){
      const date=typeof raw?.toDate==='function'?raw.toDate():new Date(raw);
      if(Number.isNaN(date.getTime()))throw new Error('記録日が不正です。');
      value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    }
    if(jsonFields.has(field)){
      if(field==='weeklyHours'){
        if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('利用時間の形式が不正です。');
        const weekly:Record<string,any>={};
        for(const day of ['月','火','水','木','金','土','日'])if(value[day]){
          const entry:Record<string,any>={};
          for(const key of ['startTime','endTime','beforeExtStartTime','beforeExtEndTime','afterExtStartTime','afterExtEndTime']){const time=value[day][key]??'';if(typeof time!=='string'||(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))throw new Error('利用時間の時刻が不正です。');entry[key]=time;}
          const diff=(start:string,end:string)=>{const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));return start&&end?Math.max(0,minute(end)-minute(start)):0;};
          entry.totalMinutes=diff(entry.startTime,entry.endTime);entry.beforeExtMinutes=diff(entry.beforeExtStartTime,entry.beforeExtEndTime);entry.afterExtMinutes=diff(entry.afterExtStartTime,entry.afterExtEndTime);weekly[day]=entry;
        }
        value=weekly;
      }else{
        if(!Array.isArray(value))throw new Error(field+'は配列で指定してください。');
        if(field==='supportRows')value=value.map((row:any)=>{if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('支援内容の行が不正です。');const next:Record<string,any>={};for(const key of ['id','category','supportGoal','supportContent','achievementPeriod','provider','notes','priority'])next[key]=String(row[key]??'');if(row.fiveAreas!==undefined&&(!Array.isArray(row.fiveAreas)||row.fiveAreas.some((v:any)=>typeof v!=='string')))throw new Error('5領域の形式が不正です。');next.fiveAreas=row.fiveAreas||[];return next;});
        else if(value.some((item:any)=>typeof item!=='string'))throw new Error(field+'の値が不正です。');
      }
    }else if(boolFields.has(field)){if(typeof value!=='boolean')throw new Error(field+'はtrue/falseで指定してください。');}
    else if(field==='variantIndex'){if(!Number.isSafeInteger(value)||value<0)throw new Error('連番が不正です。');}
    else {if(value!==null&&typeof value!=='string'&&typeof value!=='number')throw new Error(field+'の形式が不正です。');value=String(value??'');}
    put(result,field,value);
  }
  if(kind==='professionalPlans'&&!['draft','final'].includes(result.status))throw new Error('案／本案の指定がありません。');
  if(kind==='serviceHoursPlans'&&!result.weeklyHours)throw new Error('利用時間がありません。');
  return result;
}
const meta=['version','kind','recordId','childId','childName','officeId','month'];
const columns=[...meta,...new Set(Object.values(TRANSFER_FIELDS).flat())];
const protect=(value:string)=>/^[=+\-@\t\r']/.test(value)?"'"+value:value;
const unprotect=(value:string)=>value.startsWith("'")&&/^[=+\-@\t\r']/.test(value.slice(1))?value.slice(1):value;
export function transferCsv(records:TransferRecord[]):string{
  const rows=records.map(record=>{
    const data=cleanTransferData(record.kind,record.data);
    return columns.map(column=>{const value=column==='version'?'1':column==='recordId'?record.id:meta.includes(column)?(record as any)[column]:read(data,column);return value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);});
  });
  return '\uFEFF'+[columns,...rows].map(row=>row.map(value=>'"'+protect(value).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
export function transferJson(records:TransferRecord[]):string{return JSON.stringify({format:'syorui-documents',version:1,records:records.map(record=>({...record,data:cleanTransferData(record.kind,record.data)}))},null,2);}
export function parseTransfer(text:string,format:'csv'|'json'):TransferRecord[]{
  let raw:any[];
  if(format==='json'){
    const value=JSON.parse(text.replace(/^\uFEFF/,''));
    if(value.format!=='syorui-documents'||value.version!==1||!Array.isArray(value.records))throw new Error('このアプリで出力したJSONを選択してください。');raw=value.records;
  }else{
    const workbook=XLSX.read(text.replace(/^\uFEFF/,''),{type:'string',raw:true});
    const grid=XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]],{header:1,raw:true,defval:'',blankrows:false});
    const headers=(grid.shift()||[]).map(String);
    if(meta.some(key=>!headers.includes(key))||new Set(headers).size!==headers.length)throw new Error('このアプリで出力したCSVを選択してください。');
    raw=grid.map(values=>{
      const row=Object.fromEntries(headers.map((header,index)=>[header,unprotect(String(values[index]??''))]));
      if(row.version!=='1'||!Object.hasOwn(TRANSFER_FIELDS,row.kind))throw new Error('CSVの形式・書類種類が不正です。');
      const kind=row.kind as TransferKind,data:Record<string,any>={};
      for(const field of TRANSFER_FIELDS[kind]){
        if(!headers.includes(field))continue;const value=row[field];
        if(value===''){if(jsonFields.has(field)||boolFields.has(field)||field==='variantIndex')continue;put(data,field,'');continue;}
        if(jsonFields.has(field))put(data,field,JSON.parse(value));
        else if(boolFields.has(field)){if(!['true','false'].includes(value))throw new Error(field+'の指定が不正です。');put(data,field,value==='true');}
        else if(field==='variantIndex')put(data,field,Number(value));else put(data,field,value);
      }
      return {kind,id:row.recordId,childId:row.childId,childName:row.childName,officeId:row.officeId,month:row.month,data};
    });
  }
  if(!raw.length)throw new Error('取り込むデータがありません。');
  return raw.map(record=>{
    if(!record||!Object.hasOwn(TRANSFER_FIELDS,record.kind)||typeof record.id!=='string'||!record.id||record.id.includes('/')||record.id.length>1000)throw new Error('書類ID・種類が不正です。');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month)||![record.childId,record.officeId].every(value=>typeof value==='string'&&value.length>0))throw new Error('児童・事業所・対象月が不正です。');
    return {kind:record.kind,id:record.id,childId:record.childId,childName:String(record.childName||''),officeId:record.officeId,month:record.month,data:cleanTransferData(record.kind,record.data||{})};
  });
}

export function decodeTransferBytes(buffer:ArrayBuffer,format:'csv'|'json'):string{
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}
  catch{if(format==='csv')return new TextDecoder('shift_jis',{fatal:true}).decode(buffer);throw new Error('JSONはUTF-8形式で保存してください。');}
}
