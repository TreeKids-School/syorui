import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),ts=require('typescript'),exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/implementationCompletion.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports});
const {implementationCompletionPath,completedImplementationChildren}=exports;
assert.equal(implementationCompletionPath('office-a','2026-11').join('/'),'offices/office-a/monthly_implementation_completion/2026-11');
assert.notEqual(implementationCompletionPath('office-a','2026-11').join('/'),implementationCompletionPath('office-b','2026-11').join('/'));
assert.notEqual(implementationCompletionPath('office-a','2026-11').join('/'),implementationCompletionPath('office-a','2026-12').join('/'));
assert.throws(()=>implementationCompletionPath('office-a','2026-13'));assert.throws(()=>implementationCompletionPath('','2026-11'));
assert.deepEqual([...completedImplementationChildren(null)],[]);
const data={completed:{'child-a':true,'child-b':false,'child-c':'true'}};assert.deepEqual([...completedImplementationChildren(data)],['child-a']);data.completed['child-a']=false;assert.deepEqual([...completedImplementationChildren(data)],[]);
console.log('PASS: completion is isolated per office/month, true only for selected children and reversible without altering other children');
