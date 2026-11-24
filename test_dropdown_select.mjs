import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,imports={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9,jsx:4}}).outputText,{exports,require:id=>imports[id]||require(id),...globals});return exports;}
const geometry=load('src/lib/dropdownPosition.ts');
let position=geometry.dropdownPosition({left:50,top:80,bottom:120},{width:1000,height:800},7);
assert.equal(position.top,128);assert.equal(position.width,288);assert.equal(position.maxHeight,324);
position=geometry.dropdownPosition({left:950,top:700,bottom:740},{width:1000,height:800},7);assert.ok(position.left+position.width<=988);assert.ok(position.top+position.maxHeight<=692);
position=geometry.dropdownPosition({left:5,top:60,bottom:100},{width:260,height:450},7);assert.equal(position.left,12);assert.equal(position.width,236);assert.ok(position.top+position.maxHeight<=438);
// The child picker can grow without changing standard menu dimensions.
position=geometry.dropdownPosition({left:50,top:40,bottom:80},{width:1000,height:900},8,680);
assert.equal(position.maxHeight,680);assert.equal(position.top,88);
position=geometry.dropdownPosition({left:50,top:500,bottom:540},{width:1000,height:800},8,680);
assert.equal(position.maxHeight,480);assert.equal(position.top,12,'tall picker uses the larger side');
position=geometry.dropdownPosition({left:50,top:40,bottom:80},{width:320,height:500},8,680);
assert.equal(position.maxHeight,400);assert.ok(position.top+position.maxHeight<=488);
const styles=load('src/components/ui/menuStyles.ts');
let state=null,effect,refIndex=0,changes=[],focusCount=0,triggerFocus=0;
const listeners=new Map(),trigger={getBoundingClientRect:()=>({left:60,top:60,bottom:100}),contains:()=>false,focus:()=>triggerFocus++};
const buttons=[{focus:()=>focusCount++},{focus:()=>focusCount++}];
const panel={contains:target=>target==='inside',querySelector:()=>buttons[0],querySelectorAll:()=>buttons};
const refs=[{current:trigger},{current:panel},{current:false}];
const react={useId:()=>':menu:',useRef:()=>refs[refIndex++],useState:()=>[state,next=>{state=next;}],useEffect:callback=>{effect=callback;}};
const window={innerWidth:1000,innerHeight:800,addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)};
const document={body:{},activeElement:buttons[0],addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)};
const {DropdownSelect}=load('src/components/ui/DropdownSelect.tsx',{'../../lib/dropdownPosition':geometry,'./menuStyles':styles,react,'react-dom':{createPortal:(element,target)=>({element,target})}},{window,document});
const props={label:'並べ替え',value:'a',options:[{value:'a',label:'元の順番'},{value:'b',label:'名前順'}],onChange:value=>changes.push(value),iconOnly:true};
const render=()=>{refIndex=0;return DropdownSelect(props);};
let tree=render();tree.props.children[0].props.onClick({detail:1});assert.ok(state);tree=render();const cleanup=effect();assert.equal(focusCount,0,'pointer open must not steal focus');const portal=tree.props.children[1];assert.equal(portal.target,document.body);assert.equal(portal.element.props.role,'menu');const options=portal.element.props.children;assert.equal(options[0].props['aria-checked'],true);options[1].props.onClick();assert.equal(changes[0],'b');assert.equal(state,null);assert.equal(triggerFocus,1);cleanup();
tree=render();tree.props.children[0].props.onKeyDown({key:'ArrowDown',preventDefault(){}});render();const keyboardCleanup=effect();assert.equal(focusCount,1);listeners.get('pointerdown')({target:'inside'});assert.ok(state);listeners.get('keydown')({key:'Escape',preventDefault(){}});assert.equal(state,null);keyboardCleanup();assert.equal(listeners.size,0);
assert.ok(styles.menuItemClass.includes('text-sm'));assert.ok(styles.menuItemClass.includes('min-h-11'));assert.ok(styles.menuSurfaceClass.includes('rounded-2xl'));
console.log('PASS: 288pxの共通メニュー、画面端での位置調整、スクロール領域外への表示、選択反映、クリック時のフォーカス維持、キーボード操作');

trigger.closest=()=>({getAttribute:()=>':parent-panel:'});
tree=render();tree.props.children[0].props.onClick({detail:1});tree=render();assert.equal(tree.props.children[1].element.props['data-dropdown-owner'],':parent-panel:','nested sort menu belongs to child switcher');tree.props.children[1].element.props.children[0].props.onClick();
const parentSource=fs.readFileSync('src/components/ui/DropdownPanel.tsx','utf8');assert.ok(parentSource.includes('!owned(event.target)'));assert.ok(parentSource.includes('height:position.maxHeight'));assert.ok(parentSource.includes('data-dropdown-panel-id'));

let assignedOnly=true;
props.toggles=[{label:'担当児童のみ表示',checked:true,onChange:value=>{assignedOnly=value;}}];
tree=render();tree.props.children[0].props.onClick({detail:1});tree=render();
const toggle=tree.props.children[1].element.props.children[0];
assert.equal(toggle.props.role,'menuitemcheckbox');assert.equal(toggle.props['aria-checked'],true);
toggle.props.onClick();assert.equal(assignedOnly,false);assert.equal(state,null);
assert.equal(changes.length,2,'filter toggle does not change sort order');
