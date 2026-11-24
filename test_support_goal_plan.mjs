import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/supportGoalPlan.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports});
const choose=exports.supportGoalPlan;
const plan=(id,month,status='final',childId='child')=>({id,childId,startMonth:month,createdAt:month+'-01',status,longTermGoal:'入力済みの目標'});
const plans=[plan('feb','2026-02'),plan('jul-draft','2026-07','draft'),plan('aug','2026-08'),plan('other','2026-07','final','other')];
assert.equal(choose(plans,'child','2026-07').id,'feb');
assert.equal(choose(plans,'child','2026-08').id,'aug');
assert.equal(choose(plans,'child','2027-01').id,'aug');
assert.equal(choose(plans,'child','2026-01'),null);
assert.equal(choose([...plans,plan('next','2027-02')],'child','2027-02').id,'next');
assert.equal(choose(plans.map(p=>({...p,isReflected:true,reflectedStartMonth:'2020-01',reflectedEndMonth:'2030-12'})),'child','2026-07').id,'feb');
assert.equal(choose([{...plan('legacy','2026-02'),startMonth:undefined}],'child','2026-07').id,'legacy');
console.log('PASS: latest effective final plan, draft/future/other child exclusion, six-month validity including start month');

assert.equal(choose([...plans,{...plan('empty','2026-07'),longTermGoal:''}],'child','2026-07').id,'feb');
assert.equal(choose([{...plan('empty','2026-07'),longTermGoal:' '}],'child','2026-07'),null);

assert.equal(choose(plans,'child','2027-02'),null,'7th month expires');
assert.equal(choose([plan('feb','2026-02')],'child','2026-08'),null);
assert.equal(choose([plan('dec','2026-12')],'child','2027-05').id,'dec');
assert.equal(choose([plan('dec','2026-12')],'child','2027-06'),null);
assert.equal(choose(plans,'child','2026-13'),null);
const page=fs.readFileSync('src/pages/SupportImplementation.tsx','utf8');
assert.ok(page.includes("availableProfPlans.length === 0 ? planMeta?.goals || '' : ''"),'expired plans do not use saved old goals');
assert.ok(page.includes('goals: getTargetGoalsText(),'),'print uses same validity');

assert.equal(choose([{...plan('base','2026-08'),variantIndex:0},{...plan('main','2026-08'),variantIndex:1,isPrimary:true}],'child','2026-09').id,'main');
assert.equal(choose([{...plan('base','2026-08'),variantIndex:0},{...plan('main','2026-08'),variantIndex:1,isPrimary:true,archived:true}],'child','2026-09').id,'base');
