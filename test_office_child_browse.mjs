import assert from 'node:assert/strict';
import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),exports={};
new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/officeUtils.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText)(exports);
const offices=[{id:exports.OFFICE_IDS.SEARCH,name:'Search'},{id:exports.OFFICE_IDS.HOME,name:'Home'},{id:'office-c',name:'Other'}];
const children=[{id:'a',offices:['Search']},{id:'b',offices:['Home']},{id:'c',offices:['Home'],archived:true},{id:'both',offices:['Search','Home']},{id:'other',offices:['Other']}];
const ids=(office)=>exports.childrenForOffice(children,office,offices).map(child=>child.id);
assert.deepEqual(ids(exports.OFFICE_IDS.SEARCH),['a','both']);assert.deepEqual(ids(exports.OFFICE_IDS.HOME),['b','both']);assert.deepEqual(ids('office-c'),['other']);assert.deepEqual(ids('unregistered'),[]);
assert.equal(children.length,5);console.log('PASS: registered office scope, aliases, shared membership, archived exclusion and no assignment requirement');
