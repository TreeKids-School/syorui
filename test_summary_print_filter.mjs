import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/printSummaryTable.ts', 'utf8'), {compilerOptions: {module: 1, target: 9}}).outputText, {exports,require:()=>({})});
const {filterSummaryPrintChildren: filter} = exports;
const cell = (text, id) => ({text, dataset: id ? {printChildId: id} : {}});
const row = cells => ({cells, deleteCell(index) {this.cells.splice(index, 1);}});
function horizontal() {
  const names = row([cell('日付'), ...['A', 'B', 'C', 'D'].map(id => cell(id, id))]);
  const symbols = row([cell('1日'), cell('〇'), cell('◎'), cell('〇'), cell('◎')]);
  symbols.cells[2].dataset.adopted = 'true';
  const columns = {children: []};
  for (let i = 0; i < 5; i++) {
    const column = {style: {width: i ? '40px' : '80px'}, remove() {columns.children.splice(columns.children.indexOf(this), 1);}};
    columns.children.push(column);
  }
  return {dataset: {}, style: {width: '240px'}, rows: [names, symbols], tHead: {rows: [names]}, querySelector: () => columns};
}
const table = horizontal();
const retainedCell = table.rows[1].cells[2];
assert.equal(filter(table, ['A', 'C']), 2);
assert.deepEqual(table.rows[0].cells.map(c => c.text), ['日付', 'B', 'D']);
assert.deepEqual(table.rows[1].cells.map(c => c.text), ['1日', '◎', '◎']);
assert.equal(table.rows[1].cells[1], retainedCell);
assert.equal(retainedCell.dataset.adopted, 'true');
assert.equal(retainedCell.dataset.evenColumn, 'false');
assert.equal(table.rows[1].cells[2].dataset.evenColumn, 'true');
assert.equal(table.querySelector().children.length, 3);
assert.equal(table.style.width, '160px');
assert.equal(filter(horizontal(), ['A', 'B', 'C', 'D']), 0);
assert.equal(filter(horizontal(), []), 4);
const body = {rows: ['A', 'B', 'C', 'D'].map(id => row([cell(id, id), cell('◎')])), deleteRow(index) {this.rows.splice(index, 1);}};
const vertical = {dataset: {tableOrientation: 'children-rows'}, tBodies: [body]};
assert.equal(filter(vertical, ['A', 'C']), 2);
assert.deepEqual(body.rows.map(r => r.cells[0].text), ['B', 'D']);
assert.equal(body.rows[0].cells[1].text, '◎');
assert.equal(body.rows[0].cells[1].dataset.evenColumn, 'false');
assert.equal(body.rows[1].cells[1].dataset.evenColumn, 'true');
assert.equal(filter(vertical, ['B', 'D']), 0);
console.log('PASS: 縦横の児童除外・全員0・列幅・記号/採用サイン保持・残った児童の偶数色付け');
