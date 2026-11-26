/** ロック確認と本文の書込みを同じトランザクションで実行する。 */
export function guardedWriteBatch<T>(run:(body:(transaction:T)=>Promise<void>)=>Promise<void>,verify:(transaction:T)=>Promise<void>,track:(promise:Promise<void>)=>Promise<void>){
  const operations:{method:'set'|'update'|'delete';args:any[]}[]=[];let committed=false;
  const batch={
    set(...args:any[]){if(committed)throw new Error('保存処理は実行済みです。');operations.push({method:'set',args});return batch;},
    update(...args:any[]){if(committed)throw new Error('保存処理は実行済みです。');operations.push({method:'update',args});return batch;},
    delete(...args:any[]){if(committed)throw new Error('保存処理は実行済みです。');operations.push({method:'delete',args});return batch;},
    commit(){if(committed)return Promise.reject(new Error('保存処理は実行済みです。'));committed=true;return track(run(async transaction=>{await verify(transaction);for(const operation of operations){const writer=transaction as any;writer[operation.method](...operation.args);}}));},
  };return batch;
}
