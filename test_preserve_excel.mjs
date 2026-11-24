import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
function load(path, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code, {exports, require: id => imports[id] || require(id),
    console: {log() {}, error() {}}, Date, Buffer, Uint8Array, setTimeout, structuredClone});
  return exports;
}
const preserve = load('src/lib/preserveExcelSheets.ts');
const {cloneTemplateAndWriteExcelFile: write} = load('src/lib/excelExport.ts', {'./preserveExcelSheets': preserve});

// 旧ファイルに混在する文字列のシリアル値、年付き文字列、年付き書式、結合位置の違い。
for (const date1904 of [false, true]) {
  for (const useSharedStrings of [false, true]) {
    const workbook = new ExcelJS.Workbook();
    workbook.properties.date1904 = date1904;
    const sheet = workbook.addWorksheet('2026.06');
    sheet.mergeCells('A14:A16');
    const serial = date1904 ? 46175 - 1462 : 46175;
    sheet.getCell('A14').value = String(serial);
    sheet.getCell('A19').value = '2026/6/5';
    sheet.getCell('A24').value = serial;
    sheet.getCell('A24').numFmt = 'yyyy/m/d';
    sheet.getCell('A29').value = '令和8年6月12日';
    sheet.getCell('A34').value = '6月15日';
    sheet.getCell('A39').value = {formula: 'DATE(2026,6,20)', result: serial};
    sheet.getCell('A39').numFmt = 'yyyy/m/d';
    sheet.getCell('B14').value = '2026/6/5';
    const source = await workbook.xlsx.writeBuffer({useSharedStrings});
    const result = await preserve.repairExcelDateFormats(source);
    assert.equal(result.changedCells, 6);
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(result.buffer);
    const fixed = reopened.getWorksheet('2026.06');
    assert.equal(fixed.getCell('A14').value, '6月2日');
    assert.equal(fixed.getCell('A19').value, '6月5日');
    assert.equal(fixed.getCell('A24').numFmt, 'm"月"d"日"');
    assert.equal(fixed.getCell('A29').value, '6月12日');
    assert.equal(fixed.getCell('A34').value, '6月15日');
    assert.equal(fixed.getCell('A39').formula, 'DATE(2026,6,20)');
    assert.equal(fixed.getCell('A39').numFmt, 'm"月"d"日"');
    assert.equal(fixed.getCell('B14').value, '2026/6/5');
    for (const address of ['A14', 'A19', 'A24', 'A29', 'A34', 'A39']) assert.equal(fixed.getCell(address).font.size, 12);
    assert.equal((await preserve.repairExcelDateFormats(result.buffer)).changedCells, 0);
    console.log(`PASS: 年付き・文字列数値・日付欄の位置違い; date1904=${date1904}, sharedStrings=${useSharedStrings}`);
  }
}

// 復旧では日付欄のstyle参照だけを変える。値・数式・ほかのセルは保持する。
{
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('202609');
  sheet.getCell('A12').value = 46277;
  sheet.getCell('A12').font = {bold: true, color: {argb: 'FFFF0000'}};
  sheet.getCell('A12').border = {bottom: {style: 'thin'}};
  sheet.getCell('A17').value = {formula: 'DATE(2026,9,12)', result: 46277};
  sheet.getCell('A17').numFmt = '[Red]0';
  sheet.getCell('A22').value = 46277;
  sheet.getCell('A22').numFmt = 'm"月"d"日"';
  sheet.getCell('A27').value = '9月12日';
  sheet.getCell('A32').value = 12;
  sheet.getCell('E12').value = 46277;
  workbook.addWorksheet('原本').getCell('A12').value = 46277;
  workbook.addWorksheet('一覧').getCell('A12').value = 46277;
  const source = await workbook.xlsx.writeBuffer();
  const preview = await preserve.repairExcelDateFormats(source, true);
  assert.equal(preview.changedCells, 4);
  assert.equal(preview.buffer, null);
  const result = await preserve.repairExcelDateFormats(source);
  assert.equal(result.changedCells, 4);
  const originalZip = await JSZip.loadAsync(source);
  const repairedZip = await JSZip.loadAsync(result.buffer);
  for (const [path, file] of Object.entries(originalZip.files)) {
    if (file.dir || ['xl/styles.xml', 'xl/worksheets/sheet1.xml'].includes(path)) continue;
    assert.deepEqual(await repairedZip.file(path).async('uint8array'), await file.async('uint8array'), path);
  }
  const oldXml = await originalZip.file('xl/worksheets/sheet1.xml').async('string');
  const newXml = await repairedZip.file('xl/worksheets/sheet1.xml').async('string');
  const stripTargetStyles = xml => xml.replace(/<c\b[^>]*>/g, opening => /\br="A(?:12|17|22|27)"/.test(opening) ? opening.replace(/\s+s="\d+"/, '') : opening);
  assert.equal(stripTargetStyles(newXml), stripTargetStyles(oldXml));
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(result.buffer);
  const fixed = reopened.getWorksheet('202609');
  assert.equal(fixed.getCell('A12').numFmt, 'm"月"d"日"');
  assert.equal(fixed.getCell('A12').font.bold, true);
  assert.equal(fixed.getCell('A12').font.size, 12);
  assert.equal(fixed.getCell('A17').font.size, 12);
  assert.equal(fixed.getCell('A22').font.size, 12);
  assert.equal(fixed.getCell('A27').font.size, 12);
  assert.equal(fixed.getCell('A12').border.bottom.style, 'thin');
  assert.equal(fixed.getCell('A17').formula, 'DATE(2026,9,12)');
  assert.equal(fixed.getCell('A17').numFmt, 'm"月"d"日"');
  assert.equal(fixed.getCell('A27').value, '9月12日');
  assert.equal(fixed.getCell('A32').value, 12);
  assert.equal(fixed.getCell('E12').value, 46277);
  assert.equal(reopened.getWorksheet('原本').getCell('A12').value, 46277);
  const repeat = await preserve.repairExcelDateFormats(result.buffer);
  assert.equal(repeat.changedCells, 0);
  assert.equal(repeat.buffer, null);
  console.log('PASS: 日付修復は対象セルの表示形式だけ変更、値・数式・罫線・原本保持、再実行で変更なし');
}

for (const date1904 of [false, true]) {
  for (const useSharedStrings of [false, true]) {
    const wb = new ExcelJS.Workbook();
    wb.properties.date1904 = date1904;
    const past = wb.addWorksheet('202609');
    const formats = ['m"月"d"日"', '[$-411]m"月"d"日"', 'mm/dd', 'yyyy"年"m"月"d"日"'];
    formats.forEach((format, index) => {
      past.getCell(`A${index + 1}`).value = new Date('2026-09-12T00:00:00Z');
      past.getCell(`A${index + 1}`).numFmt = format;
    });
    past.getCell('B1').value = {formula: 'DATE(2026,9,12)', result: 46277};
    past.getCell('B1').numFmt = 'm"月"d"日"';
    past.getCell('C1').value = '過去の文字列';
    const template = wb.addWorksheet('原本');
    template.getCell('A5').value = '原本の目標';
    template.getColumn(1).width = 19;
    template.getCell('I2').value = '原本の児童名';
    template.getCell('E12').font = {name: 'Arial', size: 11};
    template.getCell('A12').numFmt = 'm"月"d"日"';
    const dropdown = {type: 'list', allowBlank: true, formulae: ['"①認知・行動,②運動・感覚,③言語・コミュニケーション"'], showErrorMessage: true, errorTitle: '選択してください', error: '一覧から選択してください'};
    for (const address of ['B12', 'B13', 'B17', 'B37']) template.getCell(address).dataValidation = structuredClone(dropdown);
    // 別シート参照・名前付き範囲の入力規則も保持する。
    template.getCell('Z1').value = '選択肢1';
    template.getCell('Z2').value = '選択肢2';
    wb.definedNames.add("'原本'!$Z$1:$Z$2", '療育選択肢');
    template.getCell('B22').dataValidation = {type: 'list', formulae: ['療育選択肢']};
    template.dataValidations.add('B60:B65', structuredClone(dropdown));
    let source = await wb.xlsx.writeBuffer({useSharedStrings});
    const originalZip = await JSZip.loadAsync(source);
    // ExcelJSの再保存では落ちる可能性がある、既存の独自パーツも保持する。
    originalZip.file('customXml/item1.xml', '<test>過去の情報</test>');
    source = await originalZip.generateAsync({type: 'uint8array'});
    let saved;
    const handle = {
      getFile: async () => ({name: 'test.xlsx', arrayBuffer: async () => source}),
      createWritable: async () => ({write: async buffer => {saved = buffer;}, close: async () => {}}),
    };
    const result = await write(handle, '新しい児童名', '2026-10', '', [
      {date: '2026-10-03', content: {supportContent: ['運動'], resultInfo: '今回の結果', futurePlan: '今回の予定'}},
    ], '今回の作成者', '令和8年10月31日作成');
    const outputZip = await JSZip.loadAsync(saved);
    const changed = new Set(['xl/styles.xml', 'xl/sharedStrings.xml', 'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels', '[Content_Types].xml']);
    for (const [path, file] of Object.entries(originalZip.files)) {
      if (file.dir || changed.has(path)) continue;
      assert.deepEqual(await outputZip.file(path).async('uint8array'), await file.async('uint8array'), path);
    }
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(saved);
    const old = out.getWorksheet('202609');
    formats.forEach((format, index) => {
      assert.equal(old.getCell(`A${index + 1}`).numFmt, format);
      assert.equal(old.getCell(`A${index + 1}`).value.toISOString(), '2026-09-12T00:00:00.000Z');
    });
    assert.equal(old.getCell('B1').formula, 'DATE(2026,9,12)');
    assert.equal(old.getCell('C1').value, '過去の文字列');
    assert.equal(out.properties.date1904, date1904);
    const added = out.getWorksheet(result.sheetName);
    assert.equal(added.getCell('I2').value, '新しい児童名');
    assert.equal(added.getCell('A12').value, '10月3日');
    assert.equal(added.getCell('A12').font.size, 12);
    assert.equal(added.getCell('E12').value, '今回の結果');
    assert.equal(added.getCell('H12').value, '今回の予定');
    assert.ok(added.getCell('A42').value.includes('今回の作成者'));
    assert.equal(added.getColumn(1).width, 19);
    for (const address of ['B12', 'B13', 'B17', 'B37', 'B60', 'B65']) {
      assert.deepEqual(added.getCell(address).dataValidation, dropdown, address);
    }
    assert.deepEqual(added.getCell('B22').dataValidation.formulae, ['療育選択肢']);
    assert.equal(added.getCell('B12').value, '運動');
    assert.equal(added.getCell('B17').value, null);
    assert.deepEqual(out.definedNames.getRanges('療育選択肢').ranges, ["'原本'!$Z$1:$Z$2"]);
    // 同じファイルへ2回目の追加をしても既存シートを変えない。
    source = saved;
    const second = await write(handle, '新しい児童名', '2026-10', '', [], '今回の作成者', '令和8年10月31日作成');
    const secondZip = await JSZip.loadAsync(saved);
    for (const [path, file] of Object.entries(outputZip.files)) {
      if (file.dir || changed.has(path)) continue;
      assert.deepEqual(await secondZip.file(path).async('uint8array'), await file.async('uint8array'), path);
    }
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(saved);
    assert.ok(reopened.getWorksheet(second.sheetName));
    assert.equal(reopened.getWorksheet(result.sheetName).getCell('I2').value, '新しい児童名');
    assert.deepEqual(reopened.getWorksheet(second.sheetName).getCell('B12').dataValidation, dropdown);
    assert.deepEqual(reopened.getWorksheet('原本').getCell('B12').dataValidation, dropdown);
    console.log(`PASS: date1904=${date1904}, sharedStrings=${useSharedStrings}; 過去シートXML・日付書式・数式・新シート・連続保存`);
  }
}
