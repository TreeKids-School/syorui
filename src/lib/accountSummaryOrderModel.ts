import type {SummaryChildOrder} from './summaryChildOrder';
export function summaryOrderValue(value:unknown):SummaryChildOrder{return typeof value==='string'&&['original','staff','name-asc','name-desc','today','attendance-desc','attendance-asc'].includes(value)?value as SummaryChildOrder:'original';}
/** 遅い読み込み・保存が、利用者が直前に選んだ並べ替えを巻き戻さない。 */
export function createAccountSummaryOrderStore(read:()=>Promise<unknown>,write:(order:SummaryChildOrder)=>Promise<void>){
  let snapshot={order:'original' as SummaryChildOrder,error:''},loaded=false,loading:Promise<void>|null=null,revision=0,chain=Promise.resolve();const listeners=new Set<()=>void>();
  const update=(next:Partial<typeof snapshot>)=>{snapshot={...snapshot,...next};for(const listener of listeners)listener();};
  return {
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    getSnapshot:()=>snapshot,
    load:()=>{if(loaded)return Promise.resolve();if(loading)return loading;const ticket=revision;
      loading=(async()=>{try{const value=await read();loaded=true;if(ticket===revision)update({order:summaryOrderValue(value),error:''});}catch{if(ticket===revision)update({error:'並べ替え設定を読み込めませんでした。選び直すと保存を再試行します。'});}finally{loading=null;}})();return loading;
    },
    setOrder:(order:SummaryChildOrder)=>{const selected=summaryOrderValue(order),ticket=++revision;update({order:selected,error:''});
      chain=chain.catch(()=>{}).then(async()=>{if(ticket!==revision)return;try{await write(selected);loaded=true;if(ticket===revision)update({error:''});}catch{if(ticket===revision)update({error:'並べ替えの保存に失敗しました。選び直して再試行してください。'});}});
    },
    waitForSave:()=>chain,
  };
}
