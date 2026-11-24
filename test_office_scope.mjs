import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText, {exports, require: id => imports[id] || require(id)});
  return exports;
}
const office = load('src/lib/officeUtils.ts');
const {excelExportOfficePriority: priority} = load('src/lib/excelExportOfficeScope.ts', {'./officeUtils': office});
const {SEARCH, HOME} = office.OFFICE_IDS;
const child = {id: 'synthetic-child', offices: ['search', 'ホーム']};
const month = '2026-10';
const records = [
  {id: 'search-record', data: {childId: child.id, planMonth: month, officeId: SEARCH}},
  {id: 'home-record', data: {childId: child.id, planMonth: month, officeId: HOME}},
  {id: 'unscoped-old-record', data: {childId: child.id, planMonth: month}},
  {id: 'contradictory-record', data: {childId: child.id, officeId: HOME, office: 'サーチ'}},
  {id: 'both-offices', data: {office: ['search', 'home']}},
  {id: 'combined-label', data: {office: 'searchホーム'}},
  {id: `${SEARCH}_2026-10-03`, data: {officeId: HOME}},
  {id: 'other-child', data: {childId: 'another-child', officeId: HOME}},
  {id: 'other-month', data: {planMonth: '2026-09', officeId: HOME}},
];
assert.deepEqual(records.filter(r => priority(r.data, r.id, child, SEARCH, month)).map(r => r.id), ['search-record']);
assert.deepEqual(records.filter(r => priority(r.data, r.id, child, HOME, month)).map(r => r.id), ['home-record']);
for (const [selected, other, tag] of [[SEARCH, HOME, 'サーチ'], [HOME, SEARCH, 'ホーム']]) {
  assert.ok(priority({}, `${selected}_${child.id}_${month}`, child, selected, month));
  assert.ok(priority({}, `${selected}_2026-10-03`, child, selected, month));
  assert.equal(priority({}, `${other}_2026-10-03`, child, selected, month), 0);
  assert.equal(priority({officeId: other}, `${selected}_${child.id}_${month}`, child, selected, month), 0);
  assert.ok(priority({office: tag}, 'random-id', child, selected, month));
  assert.equal(priority({}, `${child.id}_${month}`, child, selected, month), 0);
  assert.ok(priority({}, `${child.id}_${month}`, {...child, offices: [tag]}, selected, month));
  assert.equal(priority({}, `${child.id}_${month}`, {...child, offices: ['searchホーム']}, selected, month), 0);
  assert.equal(priority({officeId: [selected, other]}, 'random-id', child, selected, month), 0);
}
console.log('PASS: Search/Home両方向の共有児童分離、旧形式・矛盾・混合所属の除外、事業所付きID、別児童・別月');
