import type {DocumentType} from '../components/DocumentIcon';
export const DOCUMENT_LEASE_TTL=5*60_000;
export const DOCUMENT_LEASE_HEARTBEAT=2*60_000;
export type LeaseIdentity={sessionId:string;uid:string;name:string};
export type DocumentLease=LeaseIdentity&{leaseId:string;expiresAt:number;notice?:{id:string;sessionId:string;name:string}};
export function ownsDocumentLease(lease:DocumentLease|null,owner:{sessionId:string;leaseId:string}|null,now:number){return !!lease&&!!owner&&lease.sessionId===owner.sessionId&&lease.leaseId===owner.leaseId&&Number.isFinite(lease.expiresAt)&&lease.expiresAt>now;}
export type LeaseTransaction={read:()=>Promise<DocumentLease|null>;write:(value:Partial<DocumentLease>,merge?:boolean)=>void;remove:()=>void};
export function createDocumentLeaseStore(transact:<T>(body:(transaction:LeaseTransaction)=>Promise<T>)=>Promise<T>,now=Date.now,token=()=>crypto.randomUUID()){
  return {
    acquire:(identity:LeaseIdentity)=>transact(async tx=>{const lease=await tx.read();
      if(lease&&lease.expiresAt>now()&&lease.sessionId!==identity.sessionId){tx.write({notice:{id:token(),sessionId:identity.sessionId,name:identity.name}},true);return {status:'busy' as const,owner:lease};}
      const owned={...(lease?.sessionId===identity.sessionId&&lease.notice?{notice:lease.notice}:{}),...identity,leaseId:token(),expiresAt:now()+DOCUMENT_LEASE_TTL};tx.write(owned);return {status:'held' as const,owner:owned};
    }),
    renew:(owner:DocumentLease)=>transact(async tx=>{const lease=await tx.read();if(!ownsDocumentLease(lease,owner,now()))return {status:'busy' as const,owner:lease};const next={...lease!,name:owner.name,expiresAt:now()+DOCUMENT_LEASE_TTL};tx.write({name:next.name,expiresAt:next.expiresAt},true);return {status:'held' as const,owner:next};}),
    release:(owner:DocumentLease)=>transact(async tx=>{const lease=await tx.read();if(lease?.sessionId===owner.sessionId&&lease.leaseId===owner.leaseId)tx.remove();}),
  };
}

export function documentLeasePath(officeId:string,childId:string,book:DocumentType){
  if(!officeId||!childId)throw new Error('書類の対象を確認できません。');
  return ['offices',officeId,'document_view_sessions',encodeURIComponent(JSON.stringify([childId,book]))] as const;
}
