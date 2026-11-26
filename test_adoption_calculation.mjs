import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9,jsx:4}}).outputText,{exports,require:id=>imports[id]||require(id)});return exports;}
const attendance=load('src/lib/summaryAttendance.ts'),{requiredSummaryDays,summaryAdoptionTargets}=attendance;
const base=requiredSummaryDays(8,true);assert.equal(base,4);
assert.deepEqual({...summaryAdoptionTargets(base,2,8,true)},{requiredDays:6,nonIndividualCount:4});
assert.deepEqual({...summaryAdoptionTargets(base,2,8,false)},{requiredDays:4,nonIndividualCount:2});
for(const mode of [true,false]){assert.equal(summaryAdoptionTargets(0,0,0,mode).requiredDays,0);assert.equal(summaryAdoptionTargets(1,1,1,mode).requiredDays,1);assert.equal(summaryAdoptionTargets(6,3,12,mode).requiredDays,6);assert.equal(summaryAdoptionTargets(6,7,12,mode).nonIndividualCount,0);}
assert.equal(summaryAdoptionTargets(4,5,8,false).requiredDays,5);
const staff=load('src/lib/staffWritingSummary.ts');for(const mode of [true,false]){const count=summaryAdoptionTargets(base,2,8,mode);assert.equal(staff.summarizeStaffWritingDays({a:count},{a:'staff'}).staff.days,mode?4:2);}
const {AdoptionCalculationExample}=load('src/components/AdoptionCalculationExample.tsx',{'../lib/summaryAttendance':attendance});
for(const mode of [true,false]){const html=renderToStaticMarkup(React.createElement(AdoptionCalculationExample,{addIndividualDays:mode,individualColor:'#e0f2fe'}));assert.ok(html.includes('<svg'));assert.ok(html.includes('role="img"'));assert.ok(html.includes(mode?'上乗せする':'上乗せしない'));assert.ok(html.includes(mode?'6/6':'4/4'));assert.ok(!html.includes(mode?'4/4':'6/6'));assert.ok(html.includes('集団療育'));assert.ok(!html.includes('個別以外'));assert.ok(!html.includes('<figcaption'));assert.ok(html.includes('◎'));assert.ok(html.includes('○'));assert.ok(html.includes('#e0f2fe'));}
console.log('PASS: additive/inclusive formulas, zero/one-day exceptions, six-day cap, individual priority, staff counts and table-style comparison diagram');
