import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9,jsx:4,esModuleInterop:true}}).outputText,{exports,require:id=>imports[id]||require(id)});return exports;}
const preview=load('src/lib/printPreview.ts');
const engine=load('src/lib/professionalPlanPrint.ts',{'./printPreview':preview});
const row=(id,category)=>({id,category,supportGoal:'目標'+id,supportContent:'支援内容'+id,fiveAreas:['健康・生活','認知・行動'],achievementPeriod:'6か月',provider:'担当者',notes:'留意事項'+id,priority:'1'});
const plan={childId:'anonymous',createdAt:'2026-11-12',status:'final',familyIntention:'意向',overallPolicy:'方針',longTermGoal:'長期目標',shortTermGoal:'短期目標',serviceHours:'月〜金 14:30〜18:00',supportRows:[row('a','本人支援'),row('b','本人支援'),row('c','本人支援'),row('d','家族支援'),row('e','移行支援')],confirmation:'確認事項',managerName:'管理責任者',guardianName:'保護者',signDate:'2026-11-12'};
const doc={key:'final',label:'計画書（本案）',childName:'テスト児童',officeName:'テスト事業所',plan};
const settings={fonts:engine.professionalPrintDefaultFonts([doc]),selectedCell:'',goalHeight:40};
const before=JSON.stringify(plan),html=engine.professionalPrintHtml([doc],settings);
assert.match(html,/@page\{size:A4 landscape;margin:8mm;/);assert.match(html,/width:281mm;height:194mm;padding:0/);assert.match(html,/grid-template-rows:12mm 44mm 5mm minmax\(0,1fr\) 4mm 10mm 22mm/);assert.match(html,/grid-template-rows:10mm repeat\(5,minmax\(0,1fr\)\)/);assert.match(html,/grid-row:span 3/);
for(const field of engine.professionalPrintCells([doc])){assert.ok(html.includes('data-cell="'+field.key+'"'),field.key);assert.ok(html.includes(field.value.replace(/\n/g,'\n')),field.label);}
const resized=engine.professionalPrintHtml([doc],{...settings,fonts:{...settings.fonts,'final:row:0:notes':14}},true);assert.match(resized,/data-cell="final:row:0:notes"[^>]*><div class="cell-text" style="font-size:14pt"/);assert.ok(resized.includes('support-print-selection'));assert.ok(!html.includes('<script>'));assert.equal(JSON.stringify(plan),before);
const malicious=engine.professionalPrintHtml([{...doc,plan:{...plan,familyIntention:'</div><script>bad()</script>'}}],settings);assert.ok(!malicious.includes('<script>'));assert.ok(malicious.includes('&lt;script&gt;'));
const hours={key:'hours',label:'利用時間',childName:'テスト児童',officeName:'テスト事業所',hoursPlan:{childId:'anonymous',startMonth:'2026-11',createdAt:'2026-11-12',weeklyHours:{月:{startTime:'14:00',endTime:'18:00',totalMinutes:240,beforeExtStartTime:'13:00',beforeExtEndTime:'14:00',beforeExtMinutes:60,afterExtStartTime:'',afterExtEndTime:'',afterExtMinutes:0}},extReason:'延長理由',notes:'備考'}};
const documents=[{...doc,key:'draft',label:'計画書（案）',plan:{...plan,status:'draft'}},doc,hours];const all=engine.professionalPrintHtml(documents,settings);assert.equal((all.match(/<main class="paper /g)||[]).length,3);assert.ok(all.includes('4時間00分'));assert.ok(all.includes('1時間00分'));assert.ok(all.includes('延長理由'));assert.ok(all.includes('break-after:page'));assert.ok(all.includes('(案)個別支援計画書'));
const office=load('src/lib/officeUtils.ts'),scope=load('src/lib/excelExportOfficeScope.ts',{'./officeUtils':office}),attendance=load('src/lib/supportOfficeAttendance.ts',{'./excelExportOfficeScope':scope});
const support=load('src/lib/supportImplementationPrint.ts',{'./printPreview':preview,'./supportOfficeAttendance':attendance});
const {SupportImplementationPrintSettings}=load('src/components/SupportImplementationPrintSettings.tsx',{'./ViewportModal':{ViewportModal:props=>React.createElement('div',props)},'../lib/supportImplementationPrint':support,'../lib/professionalPlanPrint':engine});
const modal=renderToStaticMarkup(React.createElement(SupportImplementationPrintSettings,{professionalDocuments:documents,onClose:()=>{}}));assert.ok(modal.includes('固定レイアウト（A4横）'));assert.ok(modal.includes('文字サイズをまとめて調整'));assert.ok(modal.includes('複数選択モード'));assert.ok(modal.includes('height:630mm'));assert.ok(!modal.includes('印刷は最大6日分です'));
console.log('PASS: A4横281×194mmを使う固定レイアウト、全項目・5領域・署名保持、案/本案/利用時間の3枚、共通の複数選択付き印刷設定、元データ保持とHTML安全性');

const lineHeightMm=9*25.4/72*1.3;
assert.ok(7-2*1.2>=lineHeightMm,'date text fits');
assert.ok(8-2*1.2>=lineHeightMm,'signature text fits');
assert.ok(8*25.4/72*1.3+1+8+7<=22,'all footer rows fit');
assert.ok(!html.includes('data-cell="final:signDate"'));
assert.ok(html.includes('.sign>.print-cell{height:8mm;'));

assert.ok(html.includes('.identity{height:10mm;display:grid;grid-template-rows:minmax(0,1fr);'),'child name receives full header height');

assert.equal((html.match(/<span>印<\/span>/g)||[]).length,1,'one stamp field');
const importedStamp=engine.professionalPrintCells([{...doc,plan:{...plan,managerName:'管理者 印'}}]).find(c=>c.key==='final:managerName');assert.equal(importedStamp.value,'管理者');

const hoursHtml=engine.professionalPrintHtml([hours],{...settings,fonts:engine.professionalPrintDefaultFonts([hours])},true);
assert.ok(hoursHtml.includes('grid-template-columns:11% 11% repeat(7,minmax(0,1fr))'));
assert.ok(hoursHtml.includes('grid-template-rows:10mm 20mm 12mm 20mm 20mm 12mm repeat(2,minmax(0,1fr))'));
const grid=hoursHtml.split('<section class="hours-table">')[1].split('</section>')[0];
assert.ok(grid.startsWith('<div class="label">区分</div><div class="label">時間帯 / 合計</div>'));
for(const day of ['月','火','水','木','金','土','日'])for(const field of ['regular','regularTotal','before','after','extensionTotal'])assert.ok(grid.includes('data-cell="hours:day:'+day+':'+field+'"'));
assert.equal((grid.match(/class="print-cell/g)||[]).length,37,'7 days times 5 fields plus 2 notes');
assert.ok(grid.includes('grid-row:span 2'));assert.ok(grid.includes('grid-row:span 3'));assert.ok(grid.includes('hours-wide'));
const fields=engine.professionalPrintCells([hours]);
assert.equal(fields.find(f=>f.key==='hours:day:月:regularTotal').value,'4時間00分');
assert.equal(fields.find(f=>f.key==='hours:day:月:extensionTotal').value,'1時間00分');
assert.equal(fields.find(f=>f.key==='hours:day:火:regularTotal').value,'');
assert.equal(fields.find(f=>f.key==='hours:day:火:extensionTotal').value,'');
console.log('PASS: hours print matches editor weekday columns, merged categories and notes, separate totals, blank unfilled days, adjustable cells');

const midmonth={...hours,hoursPlan:{...hours.hoursPlan,effectiveStartDate:'2026-06-15',variantIndex:1}};
const midmonthFields=engine.professionalPrintCells([midmonth]);assert.equal(midmonthFields.find(field=>field.key==='hours:createdAt').value,'2026/06/15');
const midmonthHtml=engine.professionalPrintHtml([midmonth],settings);assert.ok(midmonthHtml.includes('2026/06/15'));assert.ok(midmonthHtml.includes('個別支援計画別表（利用時間）（1）'));

const finalDateSettings={...settings,professionalSignDates:{final:true,draft:false}};
const finalDateHtml=engine.professionalPrintHtml(documents,finalDateSettings,true);
assert.ok(finalDateHtml.includes('data-cell="final:signDate"'));assert.ok(!finalDateHtml.includes('data-cell="draft:signDate"'));
assert.ok(finalDateHtml.includes('2026年 11月 12日'));assert.ok(finalDateHtml.includes('class="manager-signature with-sign-date"'));
const draftDateSettings={...settings,professionalSignDates:{final:false,draft:true}};
const draftDateHtml=engine.professionalPrintHtml(documents,draftDateSettings);
assert.ok(draftDateHtml.includes('data-cell="draft:signDate"'));assert.ok(!draftDateHtml.includes('data-cell="final:signDate"'));
assert.ok(engine.professionalPrintCells(documents,finalDateSettings).some(field=>field.key==='final:signDate'));
assert.ok(modal.includes('本案に日付を表示'));assert.ok(modal.includes('案に日付を表示'));
console.log('PASS: independently toggle final/draft signature dates, manager-side placement and shared preview/print settings');
