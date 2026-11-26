import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports,require:id=>imports[id]||require(id)});return exports;}
const dates=load('src/lib/supportOfficeAttendance.ts',{'./excelExportOfficeScope':{}});
const {adoptedTreeCommunications}=load('src/lib/adoptedTreeCommunications.ts',{'./supportOfficeAttendance':dates});
const row=(date,archived,externalInfo='',resultInfo='')=>({date,archived,content:{externalInfo,resultInfo}});
const rows=[row('11月2日',false,'採用2日'),row('11月5日',true,'アーカイブ5日'),row('11月10日',false,'採用10日'),row('11月12日',false,'結果あり12日','記入済み'),row('11月15日',false,'欠席15日'),row('10月2日',false,'他月')];
const sources={'11月2日':'元の2日','11月5日':'元のアーカイブ5日','11月7日':'未採用7日','11月10日':'元の10日','11月12日':'元の12日','11月15日':'元の欠席15日'};
const attendance=new Set(['11月2日','11月5日','11月7日','11月10日','11月12日']);
assert.deepEqual(Array.from(adoptedTreeCommunications('2026-11',rows,sources,attendance),item=>item.date),['11月2日','11月10日','11月12日']);
assert.ok(!JSON.stringify(adoptedTreeCommunications('2026-11',rows,sources,attendance)).includes('アーカイブ5日'));
assert.deepEqual(Array.from(adoptedTreeCommunications('2026-11',rows,sources,attendance,new Set(['11月2日','11月7日','11月12日']),true),item=>item.date),['11月2日','11月7日']);
assert.equal(adoptedTreeCommunications('2026-11',rows,sources,attendance,new Set()).length,0);
assert.equal(adoptedTreeCommunications('2026-11',[row('11月2日',true)],sources,attendance).length,0);
assert.equal(adoptedTreeCommunications('2026-11',[row('11月2日',true,'旧文'),row('11月2日',false,'採用文')],sources,attendance)[0].text,'採用文');
assert.equal(adoptedTreeCommunications('2026-11',[],sources,attendance).length,0);
console.log('PASS: individual and bulk adopted-only selection, raw source cannot revive archived dates, explicit selection, attendance/month guards, chronological order, missing-result rule and duplicate-day handling');
