import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
function load(path,imports={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports,Intl,Date,require:id=>imports[id]||require(id)});
 return exports;
}
const requests=[];
const sdk={
 doc:(...args)=>args.slice(1),collection:(...args)=>args.slice(1),documentId:()=> '__name__',where:(...args)=>args,query:(ref,...clauses)=>({ref,clauses}),
 getDoc:async path=>{requests.push(path);return {id:path.at(-1),exists:()=>false};},
 getDocs:async request=>{requests.push(request);return {docs:[]};},
};
const {loadChildListOrderData:read}=load('src/lib/childListOrderData.ts',{'./readDiagnostics':load('src/lib/readDiagnostics.ts'),'./staffColor':load('src/lib/staffColor.ts'),'firebase/firestore':sdk,'./firebase':{db:'db',auth:{currentUser:{uid:'test'}}}});
await read('home','2026-11-04','name-asc');
await read('home','2026-11-04','name-desc');
assert.equal(requests.length,0);
const todayRead=read('home','2026-11-04','today');
assert.equal(todayRead,read('home','2026-11-04','today'));
await todayRead;
assert.equal(requests.length,2);
assert.deepEqual(requests.map(request=>request.at(-1)),['2026-11-04','home_2026-11-04']);
await read('home','2026-11-04','attendance-desc');
assert.equal(requests.length,4);
assert.equal(requests[2].ref[0],'reports');
assert.ok(requests[2].clauses[0][2].includes('2026-11-01'));
await read('home','2026-11-04','staff');
assert.equal(requests.length,6);
assert.deepEqual([...requests[4]],['offices','home','monthly_staff_assignments','2026-11']);
const {orderSummaryChildren:sort}=load('src/lib/summaryChildOrder.ts');
const kids=[{id:'a',fullName:'甲',nameKana:'あお'},{id:'b',fullName:'乙',nameKana:'いし'},{id:'c',fullName:'丙',nameKana:'うえ'}];
const ctx={assignedStaff:{a:'staffB',b:'staffA'},staff:[{id:'staffA',name:'あ'},{id:'staffB',name:'い'}],attendanceCounts:{a:{attendanceCount:1},b:{attendanceCount:3},c:{attendanceCount:0}},attendingToday:new Set(['b'])};
const ids=order=>[...sort(kids,order,ctx)].map(kid=>kid.id).join(',');
assert.equal(ids('today'),'b,a,c');
assert.equal(ids('name-asc'),'a,b,c');
assert.equal(ids('name-desc'),'c,b,a');
assert.equal(ids('attendance-desc'),'b,a,c');
assert.equal(ids('attendance-asc'),'c,a,b');
assert.equal(ids('staff'),'b,a,c');
assert.equal(ids('original'),'a,b,c');
console.log('PASS: スマホ一覧の全ソート、標準は本日分2件・名前順0件・月内限定・担当履歴限定・同時要求統合');
