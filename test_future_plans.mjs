import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const ExcelJS = require('exceljs');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions: {module: 1, target: 9, esModuleInterop: true}}).outputText,
    {exports, Date, Buffer, Uint8Array, structuredClone, console: {log() {}, error() {}}, require: id => imports[id] || require(id)});
  return exports;
}
const offices = load('src/lib/officeUtils.ts');
const scope = load('src/lib/excelExportOfficeScope.ts', {'./officeUtils': offices});
const attendance = load('src/lib/supportOfficeAttendance.ts', {'./excelExportOfficeScope': scope});
const futures = load('src/lib/supportFuturePlans.ts', {'./excelExportOfficeScope': scope, './supportOfficeAttendance': attendance});
const preserve = load('src/lib/preserveExcelSheets.ts');
const excel = load('src/lib/excelExport.ts', {'./preserveExcelSheets': preserve});
const child = {id: 'synthetic-child', offices: [offices.OFFICE_IDS.HOME, offices.OFFICE_IDS.SEARCH]};
const HOME = offices.OFFICE_IDS.HOME, SEARCH = offices.OFFICE_IDS.SEARCH;
const dates = new Set(['10月7日', '10月14日', '10月21日', '10月28日']);
const source = (officeId, day, data) => ({id: `${officeId}_2026-10-${day}`, data: {officeId, ...data}});
const map = futures.collectOfficeFuturePlans([
  source(HOME, '07', {results: {[child.id]: {futurePlan: '連絡帳の予定'}}}),
  source(SEARCH, '07', {results: {[child.id]: {futurePlan: '他事業所の予定'}}}),
], [
  source(HOME, '07', {future_plan: '新しい予定', updatedAt: '2026-11-02T10:00:00Z'}),
  source(SEARCH, '07', {future_plan: 'サーチの予定', updatedAt: '2026-11-02T11:00:00Z'}),
  source(HOME, '14', {futurePlan: '補完の予定'}),
  source(HOME, '21', {future_plan: 'アーカイブ日の予定'}),
  source(HOME, '28', {future_plan: '日報未作成の予定'}),
  source(HOME, '03', {future_plan: 'ホームの出席日ではない予定'}),
], child, HOME, '2026-10', dates);
assert.equal(map['10月7日'], '新しい予定');
assert.equal(map['10月3日'], undefined);
const row = (date, futurePlan, archived = false) => ({childId: child.id, planMonth: '2026-10', date, archived, staffId: '', type: 'tree_report',
  content: {externalInfo: '', supportContent: [], resultInfo: '結果', futurePlan}, createdAt: '', updatedAt: ''});
const raw = [row('2026-10-07', '   '), row('10月14日', '手入力済みの予定'), row('10月21日', '', true), row('10月3日', '混在記録')];
const before = JSON.stringify(raw);
const supplemented = futures.supplementSupportFutureRows(raw, map, dates, child.id, '2026-10');
assert.equal(JSON.stringify(raw), before);
assert.equal(supplemented.find(r => r.date === '10月7日').content.futurePlan, '新しい予定');
assert.equal(supplemented.find(r => r.date === '10月14日').content.futurePlan, '手入力済みの予定');
assert.equal(supplemented.find(r => r.date === '10月21日').archived, true);
assert.ok(supplemented.find(r => r.date === '10月28日'));
assert.equal(supplemented.find(r => r.date === '10月3日'), undefined);
const workbook = new ExcelJS.Workbook();
workbook.addWorksheet('原本');
const original = await workbook.xlsx.writeBuffer();
let saved, writes = 0;
const handle = {getFile: async () => ({name: 'test.xlsx', arrayBuffer: async () => original}), createWritable: async () => ({write: async buffer => {saved = buffer; writes++;}, close: async () => {}})};
const result = await excel.cloneTemplateAndWriteExcelFile(handle, '確認用', '2026-10', '', supplemented);
const output = new ExcelJS.Workbook();
await output.xlsx.load(saved);
const sheet = output.getWorksheet(result.sheetName);
assert.equal(sheet.getCell('H12').value, '新しい予定');
assert.equal(sheet.getCell('H17').value, '手入力済みの予定');
assert.equal(sheet.getCell('H22').value, '日報未作成の予定');
const tooMany = Array.from({length: 7}, (_, i) => row(`10月${i + 1}日`, '予定'));
assert.throws(() => excel.existingExcelRows(tooMany, '2026-10'), /6枠/);
await assert.rejects(excel.cloneTemplateAndWriteExcelFile(handle, '確認用', '2026-10', '', tooMany), /6枠/);
assert.equal(writes, 1);
console.log('PASS: 予定の補完・手入力優先・未作成日・事業所/出席/アーカイブ分離、Excel H列まで確認、7件以上は書込前に停止');
