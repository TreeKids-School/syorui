import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports,URLSearchParams,require:id=>imports[id]||require(id)});return exports;}
const dates=load('src/lib/summaryChildOrder.ts');const routes=load('src/lib/documentRoutes.ts',{'./summaryChildOrder':dates});
const {auditDocumentRoute}=load('src/lib/auditDocumentRoute.ts',{'./documentRoutes':routes});
const base={childId:'child-a',month:'2026-10',label:''};
assert.equal(auditDocumentRoute({...base,book:'implementation'}),'/children/child-a/support-plan/2026-10');
assert.equal(auditDocumentRoute({...base,book:'implementation',month:'2026-99'}),null);
assert.equal(auditDocumentRoute({...base,book:'implementation',childId:''}),null);
for(const [documentId,label,kind]of [['child-a_2026-10_final_office','本案','final'],['child-a_2026-10_draft_office__variant_2','案','draft'],['child-a_2026-10_office__variant_1','利用時間','hours']]){
 const target=new URL(auditDocumentRoute({...base,book:'professional',documentId,label}),'https://example.test');
 assert.equal(target.pathname,'/children/child-a/professional-perspective');assert.equal(target.searchParams.get('logMonth'),'2026-10');assert.equal(target.searchParams.get('logKind'),kind);assert.equal(target.searchParams.get('logDocument'),documentId);
}
assert.equal(auditDocumentRoute({...base,book:'force',documentId:'office_child-a_2026-10-15'}),'/children/child-a/force-sheet?date=2026-10-15');
assert.equal(auditDocumentRoute({...base,book:'force'}),'/children/child-a/force-sheet');
console.log('PASS: log links retain child, month, document kind, variant document ID and force date; common settings have no child link');
