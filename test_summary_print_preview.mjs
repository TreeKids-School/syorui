import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(path,imports={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9,jsx:4,esModuleInterop:true}}).outputText,{exports,require:id=>imports[id]||require(id),...globals});return exports;}
const preview=load('src/lib/printPreview.ts');
const engine=load('src/lib/printSummaryTable.ts',{'./printPreview':preview});
let clones=0;
const table={dataset:{},ownerDocument:{createElement:()=>({textContent:'',get outerHTML(){return '<h1>'+this.textContent+'</h1>';}})},cloneNode(){clones++;return {dataset:{},rows:[],querySelector:()=>null,querySelectorAll:()=>[],get outerHTML(){return '<table data-stripe-even-columns="'+this.dataset.stripeEvenColumns+'"><tbody><tr><td data-adopted="true">◎</td><td>〇</td></tr></tbody></table>';}};}};
const base={year:2026,month:11,orientation:'landscape',alignment:'center',stripeEvenColumns:false,repeatDateMiddle:false,repeatDateRight:false,excludeZeroAttendance:false};
const html=engine.summaryPrintHtml(table,base);assert.ok(html.includes('2026年11月分'));assert.ok(html.includes('size: A3 landscape'));assert.ok(html.includes('◎'));assert.ok(html.includes('〇'));assert.ok(html.includes('data-adopted="true"'));assert.ok(html.includes('font-size: 12px'));assert.equal(table.dataset.stripeEvenColumns,undefined);
const changed=engine.summaryPrintHtml(table,{...base,orientation:'portrait',stripeEvenColumns:true,fontSize:12,nameFontSize:14,alignment:'right'});assert.ok(changed.includes('size: A3 portrait'));assert.ok(changed.includes('data-stripe-even-columns="true"'));assert.ok(changed.includes('font-size: 16px'));assert.ok(changed.includes('const alignment = "right"'));assert.notEqual(html,changed);
assert.equal(engine.summaryPrintPage('landscape').width,420);assert.equal(engine.summaryPrintPage('portrait').height,420);
for(const [alignment,expected]of [['left',0],['center',252.5],['right',505]]){
 const docHtml=engine.summaryPrintHtml(table,{...base,alignment});const script=docHtml.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
 const name={style:{},clientWidth:80,firstElementChild:{}},printedTable={offsetWidth:1000,offsetHeight:800,querySelectorAll:()=>[name]},content={style:{},querySelector:()=>printedTable},area={clientWidth:1500,clientHeight:1000};
 const window={getComputedStyle:()=>({writingMode:'horizontal-tb'})};
 vm.runInNewContext(script,{window,document:{fonts:{ready:Promise.resolve()},getElementById:id=>id==='content'?content:area,addEventListener(){}},parent:{postMessage(){}},requestAnimationFrame:callback=>callback()});
 await window.printLayoutReady;assert.equal(content.style.transform,'scale(0.995)');assert.equal(parseFloat(content.style.left),expected);assert.ok(parseFloat(name.style.fontSize)>=14);
}
const {SummaryPrintSettings}=load('src/components/SummaryPrintSettings.tsx',{'./ViewportModal':{ViewportModal:props=>React.createElement('div',props)},'../lib/printSummaryTable':engine,'./SettingsGroup':load('src/components/SettingsGroup.tsx')});
const modal=renderToStaticMarkup(React.createElement(SummaryPrintSettings,{table,options:base,onChange(){},onClose(){}}));for(const label of ['実施状況の印刷設定','A3横・1枚','A3縦・1枚','表の文字','児童名','出席0日の児童を印刷しない','実施状況のリアルタイム印刷プレビュー'])assert.ok(modal.includes(label),label);assert.ok(modal.includes('width:420mm'));assert.ok(clones>=5);
// 印刷ダイアログは縮小・配置の完了後に開く。
let release,printed=false,written='';const ready=new Promise(resolve=>release=resolve);
const frame={title:'',style:{},remove(){},contentWindow:{printLayoutReady:ready,document:{open(){},write(value){written=value;},close(){},fonts:{ready:Promise.resolve()}},requestAnimationFrame:callback=>callback(),addEventListener(){},focus(){},print(){printed=true;}}};
const runtime=load('src/lib/printPreview.ts',{}, {document:{createElement:()=>frame,body:{appendChild(){}}}});
const running=runtime.printPreviewHtml(html,'test',{width:420,height:297});await Promise.resolve();assert.equal(printed,false);release();await running;assert.ok(printed);assert.equal(written,html);
console.log('PASS: 設定変更が同じHTMLへ反映、A3縦横・文字サイズ・色付け・寄せ方・記号保持、元の表を変更しない、縮小完了後に印刷、共通構成のプレビュー画面');
