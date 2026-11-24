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
const scope = load('src/lib/excelExportOfficeScope.ts', {'./officeUtils': office});
const {officeAttendanceDates, filterOfficeAttendanceRows, supportDateKey} = load('src/lib/supportOfficeAttendance.ts', {'./excelExportOfficeScope': scope});
const {SEARCH, HOME} = office.OFFICE_IDS;
const child = {id: 'synthetic-child', offices: [SEARCH, HOME]};
const report = (officeId, date, entry = {}, extra = {}) => ({id: `${officeId}_${date}`, data: {
  officeId, children: [{id: child.id, ...entry}], ...extra,
}});
const records = [
  report(SEARCH, '2026-10-03'), report(SEARCH, '2026-10-10'),
  report(HOME, '2026-10-07'), report(SEARCH, '2026-10-07'),
  {id: '2026-10-14', data: {officeId: HOME, children: [{id: child.id}]}},
  report(HOME, '2026-10-14', {isAbsent: true}),
  report(HOME, '2026-10-15', {isWaitlist: true}),
  report(HOME, '2026-10-16', {}, {dailyTable: {[child.id]: {isAbsent: true}}}),
  report(HOME, '2026-10-17', {officeId: SEARCH}),
  report(HOME, '2026-10-18', {}, {children: [], results: {[child.id]: {D: '古い保存本文'}}}),
  {id: '2026-10-19', data: {children: [{id: child.id}]}},
  report(HOME, '2026-09-07'),
];
const homeDates = officeAttendanceDates(records, child, HOME, '2026-10');
assert.deepEqual([...homeDates], ['10月7日']);
assert.deepEqual([...officeAttendanceDates([...records].reverse(), child, HOME, '2026-10')], ['10月7日']);
const searchDates = officeAttendanceDates(records, child, SEARCH, '2026-10');
assert.deepEqual([...searchDates].sort(), ['10月10日', '10月3日', '10月7日'].sort());
// 旧不具合でホーム名義になったサーチ日の記録も、出席日が異なれば出力されない。
const savedRows = [
  {id: 'old-mixed', officeId: HOME, date: '2026-10-03', content: {resultInfo: 'サーチ日の保存済み結果'}},
  {id: 'home', officeId: HOME, date: '10月7日', content: {resultInfo: 'ホーム日の結果'}},
  {id: 'other-search', officeId: HOME, date: '2026-10-10', content: {resultInfo: '別のサーチ日'}},
  {id: 'absent', officeId: HOME, date: '2026-10-14', content: {}},
  {id: 'other-month', officeId: HOME, date: '2026-09-07', content: {}},
];
const before = JSON.stringify(savedRows);
assert.deepEqual(filterOfficeAttendanceRows(savedRows, homeDates, '2026-10').map(row => row.id), ['home']);
assert.equal(JSON.stringify(savedRows), before);
assert.equal(supportDateKey('2026-10-07', '2026-10'), '10月7日');
assert.equal(supportDateKey('2026-10-32', '2026-10'), null);
assert.equal(supportDateKey('2026-09-07', '2026-10'), null);
console.log('PASS: ホーム名義で保存されたサーチ日も除外、両所出席・欠席・待機・矛盾・旧形式・別月、元データ不変');
