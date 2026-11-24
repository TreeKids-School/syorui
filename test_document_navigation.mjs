import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9,jsx:4}}).outputText,{exports,require:id=>imports[id]||require(id)});return exports;}
const dates=load('src/lib/summaryChildOrder.ts');const routes=load('src/lib/documentRoutes.ts',{'./summaryChildOrder':dates});
const boundary=new Date('2026-10-31T15:30:00Z');
assert.equal(routes.implementationNavigationMonth('professional','2026-12',boundary),'2026-11','individual plan period not inherited');
assert.equal(routes.implementationNavigationMonth('implementation','2026-06',boundary),'2026-06','keep explicitly viewed implementation month');
assert.equal(routes.documentRoute('implementation','child-b','2026-06'),'/children/child-b/support-plan/2026-06');
assert.equal(routes.documentRoute('professional','child-b','2026-06'),'/children/child-b/professional-perspective');
assert.equal(routes.documentRoute('force','child-b','2026-06'),'/children/child-b/force-sheet');
const filters=load('src/lib/childSwitcherFilters.ts',{'./summaryChildOrder':dates});
const child=load('src/components/ChildSwitcher.tsx',{'./StaffAccountBadge':{},'../lib/firebase':{},'../lib/summaryStaffFilter':{},'../lib/childSwitcherFilters':filters,'../lib/summaryChildOrder':dates,'../lib/childListOrderData':{},'../lib/supportOfficeAttendance':{},'../lib/readError':{},'./ui/DropdownSelect':{},'../lib/documentRoutes':routes,'./ui/DropdownPanel':{},'./ui/menuStyles':{},'react-router-dom':{useNavigate:()=>{}}});
assert.equal(child.normalizeChildSearch('ヤマダ　タロウ'),child.normalizeChildSearch('やまだたろう'));
assert.equal(child.normalizeChildSearch('ﾔﾏﾀﾞ ﾀﾛｳ'),child.normalizeChildSearch('やまだたろう'));
const summary=fs.readFileSync('src/pages/MonthlySummary.tsx','utf8');assert.ok(summary.includes("setSettingsTab('implementation');setImplementationTab('author');setIsSettingsOpen(true)"));assert.ok(summary.includes('authorShortcut'));assert.ok(summary.includes('作成者・作成日の設定'));
for(const page of ['ProfessionalPerspective','SupportImplementation','ForceSheet'])assert.ok(fs.readFileSync('src/pages/'+page+'.tsx','utf8').includes('<ChildSwitcher'));
console.log('PASS: independent implementation month, Japan month boundary, same-document child routing, kana search, all document headers and month-end settings shortcuts');
