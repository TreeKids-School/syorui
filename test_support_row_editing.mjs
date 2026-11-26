import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports,require:id=>imports[id]||require(id)});return exports;}
const officeUtils=load('src/lib/officeUtils.ts');const office=load('src/lib/excelExportOfficeScope.ts',{'./officeUtils':officeUtils});
const dates=load('src/lib/supportOfficeAttendance.ts',{'./excelExportOfficeScope':office});
const {syncSupportRowsByDate,updateSupportRowContent}=load('src/lib/supportRowEditing.ts',{'./supportOfficeAttendance':dates});
const make=(key,date,future='')=>({localKey:key,childId:'child-a',planMonth:'2026-11',date,staffId:'',type:'tree_report',content:{externalInfo:'',supportContent:[],resultInfo:'',futurePlan:future},archived:false,createdAt:'',updatedAt:''});
const original=[make('a','11月2日','2日の予定'),make('b','11月9日','9日に入力した予定')];
const synced=syncSupportRowsByDate(original,'2026-11',{'11月2日':'2日通信','11月5日':'5日通信','11月9日':'9日通信'},{'11月5日':'5日の予定','11月9日':'別の9日予定'});
assert.deepEqual(Array.from(synced,row=>row.date),['11月2日','11月9日']);assert.equal(synced[1].content.futurePlan,'9日に入力した予定');assert.equal(synced[1].content.externalInfo,'9日通信');assert.equal(original[1].content.externalInfo,'');
const reordered=[original[1],original[0]];
const edited=updateSupportRowContent(reordered,original[0],'futurePlan','2日の追記');assert.equal(edited[0].content.futurePlan,'9日に入力した予定');assert.equal(edited[1].content.futurePlan,'2日の追記');
const moved=[{...original[0],date:'11月5日'},original[1]];assert.equal(updateSupportRowContent(moved,original[0],'futurePlan','遅れて来た入力')[0].content.futurePlan,'2日の予定');
assert.equal(updateSupportRowContent([original[1]],original[0],'futurePlan','削除済み行への入力')[0].content.futurePlan,'9日に入力した予定');
const narrative=load('src/lib/supportResultNarrative.ts');const copy=load('src/lib/treeCommunicationCopy.ts',{'./supportResultNarrative':narrative});
const text=copy.buildSingleDayTreeCommunicationCopy('2026-11','11月9日','当日の通信');assert.ok(text.includes('療育を行った結果'));assert.ok(text.includes('【対象月】2026年11月'));assert.ok(text.includes('■ 11月9日\n当日の通信'));assert.ok(!text.includes('9月1日'));
console.log('PASS: missing/interleaved dates never reassign a plan, authored text retained, reordered/deleted/changed-date rows protected, single-day Gemini payload includes current-month prompt');

// 旧同期の「コピー」現象を保存先まで再現する。元日の通信と新しい日への書込みが併存する。
const storedFutures={'11月2日':'2日の予定','11月9日':'9日に入力した予定'};
const newsletterDates=['11月2日','11月5日','11月9日'];
const oldSynchronized=original.map((row,index)=>({...row,date:newsletterDates[index]||row.date}));
const duplicated={...storedFutures};for(const row of oldSynchronized)duplicated[row.date]=row.content.futurePlan;
assert.equal(duplicated['11月5日'],'9日に入力した予定');assert.equal(duplicated['11月9日'],'9日に入力した予定');
const corrected={...storedFutures};for(const row of syncSupportRowsByDate(original,'2026-11',Object.fromEntries(newsletterDates.map(date=>[date,date+'の通信'])),{}))corrected[row.date]=row.content.futurePlan;
assert.ok(!Object.hasOwn(corrected,'11月5日'));assert.equal(corrected['11月9日'],'9日に入力した予定');
console.log('PASS: reproduced old sync duplicating 9th plan onto 5th while retaining original; corrected sync does not create the second-date write');
