let session:Promise<string>|undefined;
/** 再読み込みは同じタブとして扱い、複製タブは既存タブとの応答で別IDにする。 */
export function documentTabSession():Promise<string>{
  if(session)return session;
  session=new Promise(resolve=>{
    const key='syorui-document-tab-session';let id='';
    try{id=sessionStorage.getItem(key)||'';}catch{}
    if(!id)id=crypto.randomUUID();
    const save=()=>{try{sessionStorage.setItem(key,id);}catch{}};save();
    if(typeof BroadcastChannel==='undefined'){resolve(crypto.randomUUID());return;}
    const instance=crypto.randomUUID(),channel=new BroadcastChannel('syorui-document-tab-sessions');let settled=false;
    channel.onmessage=event=>{const value=event.data;if(value?.instance===instance||value?.session!==id)return;
      if(value.type==='hello')channel.postMessage({type:'occupied',session:id,instance,target:value.instance});
      if(!settled&&value.type==='occupied'&&value.target===instance){id=crypto.randomUUID();save();}
    };
    channel.postMessage({type:'hello',session:id,instance});setTimeout(()=>{settled=true;resolve(id);},150);
  });return session;
}
