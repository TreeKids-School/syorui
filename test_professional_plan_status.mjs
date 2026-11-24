import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),XLSX=require('xlsx'),exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/professionalPlanSheetStatus.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports});
const status=exports.professionalPlanSheetStatus;
for(const [sheetName,title,expected] of [
 ['202610','(案)個別支援計画書(Search)','draft'],
 ['202610案','個別支援計画書(Search)','final'],
 ['202610','（ 案 ） 個別支援計画書（Home）','draft'],
 ['202610','【案】専門的支援計画書','draft'],
 ['202610案','専門的支援計画書(本案)','final'],
 ['202610','個別支援計画書（案）','draft']
]) {
 const workbook=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([[title],[],['支援方針','提案を受けて取り組む']]);XLSX.utils.book_append_sheet(workbook,sheet,sheetName);
 const loaded=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 assert.equal(status(loaded.Sheets[sheetName]).status,expected,title);
}
assert.equal(status(XLSX.utils.aoa_to_sheet([['（案）','個別支援計画書(Search)']])).status,'draft');
assert.equal(status(XLSX.utils.aoa_to_sheet([['個別支援計画書'],['提案','案を検討する']])).status,'final');
assert.equal(status(XLSX.utils.aoa_to_sheet([['一般資料']])).status,'final');
console.log('PASS: シート内表題を優先、案なしは本案、全角括弧・空白・別セルの案に対応、本文の案で誤判定しない');
