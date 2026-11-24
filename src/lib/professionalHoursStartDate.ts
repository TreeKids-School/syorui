import * as XLSX from 'xlsx';

function calendarDate(year:number,month:number,day:number):string|null{
  if(year<1900||year>9999||month<1||month>12||day<1||day>31)return null;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function parseDate(raw:string):string|null{
  const text=raw.normalize('NFKC').replace(/[\s　]+/g,'');
  const japanese=text.match(/(令和|平成|昭和|R|H|S)?(元|\d{1,4})年(\d{1,2})月(\d{1,2})日?/i);
  if(japanese){
    let year=japanese[2]==='元'?1:Number(japanese[2]);
    const era=japanese[1]?.toUpperCase();
    if(era==='令和'||era==='R'||(!era&&year<100))year+=2018;
    else if(era==='平成'||era==='H')year+=1988;
    else if(era==='昭和'||era==='S')year+=1925;
    return calendarDate(year,Number(japanese[3]),Number(japanese[4]));
  }
  const western=text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(western)return calendarDate(Number(western[1]),Number(western[2]),Number(western[3]));
  const shortEra=text.match(/([RHS])(\d{1,2})[-/.](\d{1,2})[-/.](\d{1,2})/i);
  if(shortEra)return calendarDate(Number(shortEra[2])+({R:2018,H:1988,S:1925}[shortEra[1].toUpperCase()]||0),Number(shortEra[3]),Number(shortEra[4]));
  return null;
}

/** Read the labelled effective date, including merged cells and split year/month/day fields. */
export function professionalHoursStartDate(sheet:XLSX.WorkSheet,date1904=false):{found:boolean;date?:string;raw:string}{
  const formatted=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:false});
  const values=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true});
  const label=/(?:利用)?開始年月日|適用開始(?:年月日|日)/;
  for(let row=0;row<formatted.length;row++)for(let column=0;column<formatted[row].length;column++){
    const value=String(formatted[row][column]||'').normalize('NFKC').replace(/[\s　]+/g,'');
    if(!label.test(value))continue;
    const tail=value.split(label).at(-1)?.replace(/^[：:]/,'')||'';
    const right=formatted[row].slice(column+1,column+17).map(v=>String(v??'').trim()).filter(Boolean);
    const raw=[tail,...right].filter(Boolean).join(' ');
    const date=parseDate(raw);
    if(date)return {found:true,date,raw};
    const numeric=values[row]?.slice(column+1,column+17).filter(v=>v!==undefined&&v!==null&&v!=='')||[];
    if(numeric.length>=3&&numeric.slice(0,3).every(v=>typeof v==='number')){
      const [year,month,day]=numeric as number[];
      const split=calendarDate(year<100?year+2018:year,month,day);
      if(split)return {found:true,date:split,raw};
    }
    const first=numeric[0];
    if(typeof first==='number'&&first>=20000&&first<=100000){
      const parts=XLSX.SSF.parse_date_code(first,{date1904});
      const serial=parts&&calendarDate(parts.y,parts.m,parts.d);
      if(serial)return {found:true,date:serial,raw};
    }
    return {found:true,raw};
  }
  return {found:false,raw:''};
}
