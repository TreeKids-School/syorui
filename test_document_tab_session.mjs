import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),ts=require('typescript');
const channels=new Set();let sequence=0;
class Channel{constructor(name){this.name=name;channels.add(this);}postMessage(data){for(const peer of channels)if(peer!==this&&peer.name===this.name)queueMicrotask(()=>{if(channels.has(peer))peer.onmessage?.({data});});}close(){channels.delete(this);}}
const source=ts.transpileModule(fs.readFileSync('src/lib/documentTabSession.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText;
function tab(initial=new Map()){const exports={},storage=new Map(initial),owned=[];class OwnedChannel extends Channel{constructor(name){super(name);owned.push(this);}}
 vm.runInNewContext(source,{exports,crypto:{randomUUID:()=> 'session-'+ ++sequence},BroadcastChannel:OwnedChannel,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout});return {open:exports.documentTabSession,storage,close:()=>owned.forEach(channel=>channel.close())};}
const first=tab(),firstId=await first.open();assert.equal(await first.open(),firstId);
const clone=tab(first.storage),cloneId=await clone.open();assert.notEqual(cloneId,firstId,'duplicated tab must not inherit edit ownership');
first.close();const refreshed=tab(first.storage);assert.equal(await refreshed.open(),firstId,'refresh should retain the tab session');
const other=tab();assert.notEqual(await other.open(),firstId);clone.close();refreshed.close();other.close();
console.log('PASS: reload retains own session, duplicated tab forks identity, independent tab differs and repeated lookups share one handshake');
