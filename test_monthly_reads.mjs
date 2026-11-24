import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions: {module: 1, target: 9}}).outputText,
    {exports, Date, require: id => imports[id] || require(id)});
  return exports;
}
const office = load('src/lib/officeUtils.ts');
const {SEARCH, HOME} = office.OFFICE_IDS;
const normalized = office.resolveChildOffices({offices: ['サーチ'], officeId: SEARCH, tags: ['search', '児童発達支援', '契約中']});
assert.deepEqual([...normalized], [SEARCH]);
assert.deepEqual([...office.resolveChildOffices({offices: ['ホーム', HOME], office: 'home', tags: ['ホーム', '新規']})], [HOME]);
assert.deepEqual([...office.resolveChildOffices({tags: ['search', 'home']})].sort(), [SEARCH, HOME].sort());
const scope = load('src/lib/excelExportOfficeScope.ts', {'./officeUtils': office});
assert.ok(scope.excelExportOfficePriority({}, '2026-11-02', {id: 'synthetic', offices: normalized}, SEARCH, '2026-11'));
assert.equal(scope.excelExportOfficePriority({}, '2026-11-02', {id: 'synthetic', offices: [SEARCH, HOME]}, SEARCH, '2026-11'), 0);
const requests = [];
let fail = false;
const firestore = {
  collection: (...path) => path,
  documentId: () => '__name__',
  where: (...values) => values,
  query: (path, ...constraints) => ({path, constraints}),
  getDocsFromServer: request => {
    requests.push(request);
    return fail ? Promise.reject({code: 'resource-exhausted'}) : Promise.resolve({docs: [{id: request.constraints[0][2]}]});
  },
};
const diagnostics=load('src/lib/readDiagnostics.ts');
const {getMonthlyTreeCommunications:read,invalidateMonthlyTreeCommunications:invalidate} = load('src/lib/monthlyTreeCommunications.ts', {
  './readDiagnostics':diagnostics, 'firebase/firestore': firestore, './firebase': {auth: {currentUser: {uid: 'synthetic-user'}}, db: 'db'},
});
const first = read('synthetic', HOME, '2026-11');
const second = read('synthetic', HOME, '2026-11');
assert.equal(first, second);
await Promise.all([first, second]);
assert.equal(requests.length, 2);
for (const request of requests) {
  assert.equal(request.constraints.length, 2);
  assert.equal(request.constraints[0][0], '__name__');
  assert.equal(request.constraints[0][1], '>=');
  assert.ok(request.constraints[0][2].endsWith('2026-11-01'));
  assert.equal(request.constraints[1][1], '<=');
  assert.ok(request.constraints[1][2].endsWith('2026-11-31'));
}
await read('synthetic', HOME, '2026-11');
assert.equal(requests.length,2,'reuse a completed read for 30 seconds');
invalidate(HOME,'2026-11','synthetic');await read('synthetic',HOME,'2026-11');assert.equal(requests.length,4,'explicit mutations invalidate the scoped cache');
fail = true;
await assert.rejects(read('synthetic', HOME, '2026-12'), error => error.code === 'resource-exhausted');
const {describeReadError} = load('src/lib/readError.ts');
assert.match(describeReadError({code: 'resource-exhausted'}), /読み取り上限/);
const {summaryTreeReadDates} = load('src/lib/summaryTreeRead.ts');
const relevantDates = summaryTreeReadDates('2026-11', {
  '11月2日': {isAbsent: false, isWaitlist: false},
  '11月3日': {isAbsent: true, isWaitlist: false},
  '11月4日': {isAbsent: false, isWaitlist: true},
}, {'11月7日': {}, '10月8日': {}});
assert.deepEqual([...relevantDates], ['2026-11-02', '2026-11-07']);
assert.deepEqual([...summaryTreeReadDates('2026-11', {}, {})], []);
fail = false;
let before = requests.length;
await read('synthetic', HOME, '2026-11', relevantDates);
assert.equal(requests.length - before, 1);
assert.equal(requests.at(-1).constraints[0][1], 'in');
assert.deepEqual([...requests.at(-1).constraints[0][2]], [
  '2026-11-02', `${HOME}_2026-11-02`, '2026-11-07', `${HOME}_2026-11-07`,
]);
before = requests.length;
await read('synthetic', HOME, '2026-11', []);
assert.equal(requests.length, before);
const fullMonth = Array.from({length: 30}, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`);
await read('synthetic', HOME, '2026-11', fullMonth);
assert.equal(requests.length - before, 2);
assert.ok(requests.slice(before).every(request => request.constraints[0][2].length <= 30));
assert.throws(() => read('synthetic', HOME, '2026-11', ['2026-12-01']));
console.log('PASS: 所属別名・一般タグの正規化、新規単独所属の旧データ読取、共有児童分離、対象月限定・同時要求統合・上限エラー保持');
console.log('PASS: 一覧の通信取得を出席/保存済みの日だけに限定、対象なしは0回、30件分割');

const now=Date.now;const countBeforeExpiry=requests.length;try{Date.now=()=>now()+31_000;await read('synthetic',HOME,'2026-11');assert.equal(requests.length,countBeforeExpiry+2,'completed cache expires after 30 seconds');}finally{Date.now=now;}
