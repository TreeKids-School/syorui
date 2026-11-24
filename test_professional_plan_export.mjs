import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),ExcelJS=require('exceljs');
const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync('src/lib/professionalPlanExport.ts','utf8'),{compilerOptions:{module:1,target:9,esModuleInterop:true}}).outputText)(exports,id=>id==='./professionalManager'?{cleanProfessionalManagerName:value=>String(value||'').trim().replace(/印$/,'').trim()}:require(id));
const plan={childId:'synthetic',createdAt:'2026-11-17',startMonth:'2026-11',status:'final',familyIntention:'意向',overallPolicy:'方針',longTermGoal:'長期目標',shortTermGoal:'短期目標',serviceHours:'月曜 14:30〜17:30',supportRows:[{category:'本人支援',supportGoal:'具体的目標',supportContent:'具体的内容',fiveAreas:['健康・生活','認知・行動'],achievementPeriod:'6か月',provider:'職員',notes:'留意事項',priority:'1'}],confirmation:'確認事項本文',managerName:'責任者 印',guardianName:'保護者',signDate:'2026-11-20'};
const hours={childId:'synthetic',startMonth:'2026-11',effectiveStartDate:'2026-11-17',createdAt:'2026-11-01',weeklyHours:{月:{startTime:'14:30',endTime:'17:30',totalMinutes:180,beforeExtStartTime:'13:30',beforeExtEndTime:'14:30',beforeExtMinutes:60,afterExtStartTime:'',afterExtEndTime:'',afterExtMinutes:0}},extReason:'延長理由',notes:'特記事項'};
const common={childName:'テスト児童',officeName:'テスト事業所'};
const docs=[{...common,key:'draft',label:'案',plan:{...plan,status:'draft'}},{...common,key:'final',label:'本案',plan},{...common,key:'hours',label:'利用時間',hoursPlan:hours},{...common,key:'hours1',label:'利用時間（1）',hoursPlan:{...hours,variantIndex:1}}];
const before=JSON.stringify(docs),workbook=exports.professionalPlanWorkbook(docs);
assert.deepEqual(Array.from(workbook.worksheets,sheet=>sheet.name),['202611案','202611','利用時間','利用時間 (1)']);
assert.ok(workbook.worksheets[0].getCell('A1').value.startsWith('(案)'));
const final=workbook.getWorksheet('202611');assert.equal(final.getCell('C2').value,'テスト児童');assert.equal(final.getCell('C3').value,'2026-11-17');assert.equal(final.getCell('C5').value,'意向');assert.equal(final.getCell('C12').value,'具体的内容');
const all=final.getSheetValues().flat().filter(Boolean);assert.ok(all.includes('責任者'));assert.ok(all.includes('保護者'));assert.ok(all.includes('2026-11-20'));
const service=workbook.getWorksheet('利用時間');assert.equal(service.getCell('C3').value,'2026-11-17');assert.equal(service.getCell('C6').value,'14:30 ～ 17:30');assert.equal(service.getCell('C7').value,'3時間00分');assert.equal(service.getCell('D6').value,'');assert.equal(service.getCell('D7').value,'');assert.equal(service.getCell('C10').value,'1時間00分');
for(const sheet of workbook.worksheets){assert.equal(sheet.pageSetup.paperSize,9);assert.equal(sheet.pageSetup.orientation,'landscape');assert.equal(sheet.pageSetup.fitToHeight,1);}
const buffer=await workbook.xlsx.writeBuffer(),reloaded=new ExcelJS.Workbook();await reloaded.xlsx.load(buffer);assert.equal(reloaded.worksheets.length,4);assert.equal(reloaded.getWorksheet('利用時間').getCell('C3').value,'2026-11-17');assert.equal(JSON.stringify(docs),before);
assert.throws(()=>exports.professionalPlanWorkbook([]),/選択/);
console.log('PASS: final/draft/hours/variants as separate Excel sheets, exact start day, all plan fields, blank unfilled times, A4 landscape, XLSX reload and source-data preservation');
