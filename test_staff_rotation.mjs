import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions: {module: 1, target: 9}}).outputText, {exports});
  return exports;
}
const {distributeStaffWorkload: distribute, applyStaffDistribution} = load('src/lib/distributeStaffWorkload.ts');
const {requiredSummaryDays, countSummaryAttendance} = load('src/lib/summaryAttendance.ts');
const assignmentOf = buckets => Object.fromEntries(Object.entries(buckets).flatMap(([staff, bucket]) => bucket.childIds.map(child => [child, staff])));
const check = (items, staff, buckets) => {
  const assignment = assignmentOf(buckets);
  assert.equal(Object.keys(assignment).length, items.length);
  assert.equal(Object.values(buckets).reduce((sum, b) => sum + b.childIds.length, 0), items.length);
  assert.equal(Object.values(buckets).reduce((sum, b) => sum + b.totalDays, 0), items.reduce((sum, child) => sum + child.days, 0));
  assert.ok(Object.values(assignment).every(id => staff.includes(id)));
  const totals = Object.values(buckets).map(b => b.totalDays);
  return Math.max(...totals) - Math.min(...totals);
};
for (const adjacent of [false, true]) {
  const items = Array.from({length: 12}, (_, index) => ({id: `child-${index}`, days: (index % 3) + 1}));
  const staff = ['A', 'B', 'C'];
  const first = distribute(items, staff, adjacent);
  const previous = assignmentOf(first);
  const rotated = distribute(items, staff, adjacent, previous);
  assert.ok(check(items, staff, rotated) <= 2);
  const assignments = assignmentOf(rotated);
  assert.equal(items.filter(item => assignments[item.id] === previous[item.id]).length, 0);
  const changedStaff = distribute(items, ['B', 'C'], adjacent, previous);
  assert.ok(check(items, ['B', 'C'], changedStaff) <= 2);
  const single = distribute(items, ['A'], adjacent, previous);
  check(items, ['A'], single);
  console.log(`PASS: 前月担当を全員変更、差2日以内、スタッフ変更・1人の場合、近接まとめ=${adjacent}`);
}
for (const houkago of [false, true]) {
  assert.equal(requiredSummaryDays(0, houkago), 0);
  assert.equal(requiredSummaryDays(1, houkago), 1);
  assert.equal(requiredSummaryDays(2, houkago), houkago ? 2 : 4);
  assert.equal(requiredSummaryDays(6, houkago), 4);
  assert.equal(requiredSummaryDays(12, houkago), 6);
}
console.log('PASS: 放デイ・児発とも出席1日は必要1日、その他の計算基準は保持');

{
  const current = {individualOnly: 'A', regular: 'A', untouched: 'C'};
  const changed = applyStaffDistribution(current, {B: {childIds: ['regular']}}, ['individualOnly']);
  assert.equal(changed.individualOnly, undefined);
  assert.equal(changed.regular, 'B');
  assert.equal(changed.untouched, 'C');
  assert.equal(current.individualOnly, 'A');
  const clearOnly = applyStaffDistribution(current, {}, ['individualOnly']);
  assert.equal(clearOnly.individualOnly, undefined);
  assert.equal(clearOnly.regular, 'A');
  console.log('PASS: 個別のみの児童は既存担当も解除、解除だけの処理・対象外の担当は保持');
}

{
  const attendance = Object.fromEntries(Array.from({length: 6}, (_, index) => [`10月${index + 1}日`, {officeId: 'home'}]));
  attendance['10月7日'] = {officeId: 'search'};
  attendance['10月8日'] = {officeId: 'home', isAbsent: true};
  const adopted = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
  const a = countSummaryAttendance([...adopted], 10, 'home', attendance, day => day <= 2);
  assert.equal(a.totalCount, 6);
  assert.equal(a.nonIndividualCount, 4);
  const b = countSummaryAttendance([3, 4], 10, 'home', attendance, day => day <= 2);
  const c = countSummaryAttendance([1, 2], 10, 'home', attendance, day => day <= 2);
  assert.equal(c.nonIndividualCount, 0);
  const weights = [{id: 'a', days: a.nonIndividualCount}, {id: 'b', days: b.nonIndividualCount}, {id: 'c', days: c.nonIndividualCount}].filter(item => item.days > 0);
  const result = distribute(weights, ['A', 'B'], false);
  assert.ok(check(weights, ['A', 'B'], result) <= 2);
  assert.equal(Object.values(result).reduce((sum, bucket) => sum + bucket.totalDays, 0), 6);
  assert.equal(adopted.size, 8);
  console.log('PASS: 個別2日を除いた4日で割振、個別のみは0、他事業所・欠席除外、採用選択自体は不変');
}
