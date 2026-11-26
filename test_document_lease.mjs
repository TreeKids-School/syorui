import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),ts=require('typescript');
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports});return exports;}
const {createDocumentLeaseStore,ownsDocumentLease,DOCUMENT_LEASE_TTL,documentLeasePath,documentLeaseObservation}=load('src/lib/documentLeaseModel.ts');
const {guardedWriteBatch}=load('src/lib/guardedWriteBatch.ts');
let value=null,clock=1000,serial=Promise.resolve(),token=0;
const transact=body=>{const result=serial.then(async()=>{let next=structuredClone(value);const result=await body({read:async()=>structuredClone(value),write:(data,merge)=>{next=merge?{...next,...data}:structuredClone(data);},remove:()=>{next=null;}});value=next;return result;});serial=result.catch(()=>{});return result;};
const store=createDocumentLeaseStore(transact,()=>clock,()=>String(++token));
const a={sessionId:'tab-a',uid:'same-user',name:'職員A'},b={sessionId:'tab-b',uid:'same-user',name:'職員B'};
const [first,second]=await Promise.all([store.acquire(a),store.acquire(b)]);assert.equal(first.status,'held');assert.equal(second.status,'busy');assert.equal(second.owner.name,'職員A');assert.equal(value.notice.name,'職員B');assert.equal(value.sessionId,'tab-a');
assert.ok(ownsDocumentLease(value,first.owner,clock));await store.release({...first.owner,sessionId:'tab-b'});assert.equal(value.sessionId,'tab-a');
clock+=120000;const renewed=await store.renew(first.owner);assert.equal(renewed.status,'held');assert.equal(value.notice.name,'職員B');assert.equal(value.expiresAt,clock+DOCUMENT_LEASE_TTL);
const refreshed=await store.acquire(a);assert.equal(refreshed.status,'held');assert.notEqual(refreshed.owner.leaseId,first.owner.leaseId);assert.equal(refreshed.owner.notice.name,'職員B','a refresh keeps the other screen notification');await store.release(first.owner);assert.equal(value.leaseId,refreshed.owner.leaseId);
const operations=[];let verified=false;const run=async body=>{const staged=[];await body({set:(...args)=>{assert.ok(verified);staged.push(['set',...args]);},delete:(...args)=>{assert.ok(verified);staged.push(['delete',...args]);},update:(...args)=>{assert.ok(verified);staged.push(['update',...args]);}});operations.push(...staged);};
const pending=new Set(),track=promise=>{pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;};
const verify=async()=>{if(!ownsDocumentLease(value,refreshed.owner,clock))throw new Error('lost');verified=true;};
const batch=guardedWriteBatch(run,verify,track);batch.set('body',{text:'draft'}).update('other',{field:true}).delete('removed');await batch.commit();assert.equal(operations.length,3);assert.equal(pending.size,0);await assert.rejects(batch.commit());
clock=value.expiresAt+1;const takeover=await store.acquire(b);assert.equal(takeover.status,'held');assert.equal((await store.renew(refreshed.owner)).status,'busy');await store.release(refreshed.owner);assert.equal(value.sessionId,'tab-b');
verified=false;const stale=guardedWriteBatch(run,verify,track);stale.set('body',{text:'stale draft'});await assert.rejects(stale.commit(),/lost/);assert.equal(operations.length,3,'stale lease must perform zero document writes');
await store.release(takeover.owner);assert.equal(value,null);
assert.notEqual(documentLeasePath('office','child','professional').join('/'),documentLeasePath('office','child','implementation').join('/'));assert.notEqual(documentLeasePath('office','child','implementation').join('/'),documentLeasePath('other','child','implementation').join('/'));
console.log('PASS: atomic first-open ownership, same-account other tab blocked, both account names notified, heartbeat, expiry, refresh tokens, safe release, guarded saves and office/child/book isolation');

// 再現: 5分以上バックグラウンドに置いた自分のロックを、他端末使用中と誤認しない。
const own=await store.acquire(a);clock=own.owner.expiresAt+1;
assert.equal(documentLeaseObservation(value,own.owner,clock,{fromCache:false,hasPendingWrites:false},false),'recover');
const resumed=await store.renew(own.owner);assert.equal(resumed.status,'held');assert.notEqual(resumed.owner.leaseId,own.owner.leaseId);assert.ok(ownsDocumentLease(value,resumed.owner,clock));
await store.release(own.owner);assert.equal(value.leaseId,resumed.owner.leaseId,'old cleanup cannot delete recovered ownership');
const authoritative={fromCache:false,hasPendingWrites:false};
assert.equal(documentLeaseObservation(null,resumed.owner,clock,{fromCache:true,hasPendingWrites:false},false),'ignore','cached empty document is not a competing screen');
assert.equal(documentLeaseObservation(own.owner,resumed.owner,clock,{fromCache:false,hasPendingWrites:true},false),'ignore','local pending writes must not invalidate a confirmed lease');
assert.equal(documentLeaseObservation(own.owner,resumed.owner,clock,authoritative,true),'ignore','acquisition and renewal settle before interpreting snapshots');
assert.equal(documentLeaseObservation(value,resumed.owner,clock,authoritative,false),'held');
assert.equal(documentLeaseObservation(null,resumed.owner,clock,authoritative,false),'recover');
// 期限切れ後に二端末が同時復帰しても、トランザクションで一方だけ許可する。
clock=value.expiresAt+1;
const [resumedA,resumedB]=await Promise.all([store.renew(resumed.owner),store.renew({...resumed.owner,...b})]);
assert.equal(resumedA.status,'held');assert.equal(resumedB.status,'busy');assert.equal(value.sessionId,a.sessionId);
assert.equal(documentLeaseObservation(value,{...resumedA.owner,...b},clock,authoritative,false),'busy','a live foreign owner is still blocked');
assert.equal(documentLeaseObservation(value,{...resumedA.owner,...b},clock,{fromCache:true,hasPendingWrites:false},false),'ignore','a cached foreign owner must be verified with the server');
await store.release(resumedA.owner);
const missing=await store.renew(resumedA.owner);assert.equal(missing.status,'held','an unowned document recovers automatically');await store.release(missing.owner);
console.log('PASS: expired/missing own lease recovers without a button, stale cache/pending snapshots ignored, concurrent recovery stays exclusive and stale cleanup remains safe');
