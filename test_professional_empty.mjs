import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path){const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9}}).outputText)(exports);return exports;}
const {professionalEditorRecord:resolve,professionalBlankPeriodKey:key}=load('src/lib/professionalEditorRecord.ts');
const {createDocumentAutoSaver}=load('src/lib/documentAutoSave.ts');
let created=0,written=[];const factory=()=>{created++;return {text:'',date:'2026-11-26'};};
const saver=createDocumentAutoSaver(async value=>written.push(value),()=>{});
for(const tab of ['final','draft','hours']){
  const value=resolve(undefined,{explicitlyAdded:false,archived:false,existingCount:0},factory);
  assert.equal(value,null,tab+' must stay absent on ordinary navigation');
  if(value)saver.loaded(tab,value);
}
await saver.flushAll();assert.equal(created,0);assert.equal(written.length,0);
const scopes=new Set([key('office-a','child-a','2026-11')]);
for(const target of [['office-b','child-a','2026-11'],['office-a','child-b','2026-11'],['office-a','child-a','2026-12']])assert.equal(resolve(undefined,{explicitlyAdded:scopes.has(key(...target)),archived:false,existingCount:0},factory),null);
assert.equal(resolve(undefined,{explicitlyAdded:true,archived:true,existingCount:0},factory),null);
assert.equal(resolve(undefined,{explicitlyAdded:true,archived:false,existingCount:1},factory),null,'an unavailable existing variant must not be replaced');
const existing={text:'saved contents'};assert.equal(resolve(existing,{explicitlyAdded:false,archived:false,existingCount:1},factory),existing);
const added=resolve(undefined,{explicitlyAdded:true,archived:false,existingCount:0},factory);assert.equal(created,1);saver.loaded('explicit',added);await saver.flushAll();assert.equal(written.length,0,'opening an explicitly added blank does not save by itself');saver.schedule('explicit',{...added,text:'deliberate edit'});await saver.flushAll();assert.equal(written.length,1);assert.equal(written[0].text,'deliberate edit');
console.log('PASS: missing final/draft/hours never instantiate or save on view, explicit creation scoped by child/office/month, archived/variant guards, existing documents preserved and deliberate edits still autosave');
