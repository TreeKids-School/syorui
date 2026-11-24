import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports,require:id=>imports[id]||require(id)});return exports;}
const draft=load('src/lib/professionalPlanDraft.ts');const {copyProfessionalPeriod:copy}=load('src/lib/copyProfessionalPeriod.ts',{'./professionalPlanDraft':draft});
const plan={id:'old',childId:'child',officeId:'home',startMonth:'2026-06',createdAt:'2026-06-15',status:'final',longTermGoal:'目標',supportRows:[{id:'row',supportContent:'内容'}],guardianName:'署名',signDate:'2026-06-20',isReflected:true,reflectedStartMonth:'2026-06',reflectedEndMonth:'2026-11',archived:true,archivedAt:'past',updatedAt:'past'};
const hours={id:'old-hours',childId:'child',officeId:'home',startMonth:'2026-06',createdAt:'2026-06-15',weeklyHours:{月:{startTime:'14:00',endTime:'17:00',totalMinutes:180}},notes:'備考'};
const source={plans:[plan,{...plan,status:'draft',id:'draft'}, {...plan,childId:'other',id:'other'}],hours:[hours]};const before=JSON.stringify(source);
const targets=copy(source,'child','home','2026-06','2026-12',['final','draft','hours']);assert.equal(targets.length,3);
for(const target of targets){assert.ok(target.id.startsWith('child_2026-12'));assert.ok(target.id.endsWith('_home'));assert.equal(target.data.startMonth,'2026-12');assert.equal(target.data.createdAt,'2026-12-01');assert.equal(target.data.archived,false);assert.ok(!('updatedAt'in target.data));assert.ok(!('id'in target.data));assert.ok(!('reflectedStartMonth'in target.data));}
assert.equal(targets[0].data.longTermGoal,'目標');assert.equal(targets[0].data.guardianName,'');assert.equal(targets[0].data.signDate,'');assert.equal(targets[0].data.isReflected,false);assert.equal(targets[2].data.weeklyHours.月.totalMinutes,180);assert.equal(JSON.stringify(source),before);
assert.equal(copy(source,'child','home','2026-06','2027-01',['hours']).length,1);
assert.throws(()=>copy(source,'child','home','2026-06','2026-06',['final']));
assert.throws(()=>copy(source,'child','home','2026-06','2026-13',['final']));
assert.throws(()=>copy(source,'child','search','2026-06','2026-12',['final']),/ありません/);
assert.throws(()=>copy(source,'child','home','2025-06','2026-12',['final']),/ありません/);
assert.throws(()=>copy(source,'child','home','2026-06','2026-12',[]),/ありません/);
const numbered=copy({plans:[plan,{...plan,variantIndex:1}],hours:[]},'child','home','2026-06','2026-12',['final']);assert.equal(numbered.length,2);assert.notEqual(numbered[0].id,numbered[1].id);
const page=fs.readFileSync('src/pages/ProfessionalPerspective.tsx','utf8');assert.ok(page.includes('existing.some(record=>record.exists())'));assert.ok(page.includes('コピーして追加'));assert.ok(page.includes('コピー元の月'));
console.log('PASS: copy selected plan kinds across years, preserve content, reset dates/signatures/metadata, child/office isolation, invalid/missing/duplicate source rejection and destination overwrite guard');
