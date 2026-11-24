export type DocumentSaveStatus='pending'|'saving'|'saved'|'error';
/** Debounce edits per document and serialize writes without returning old data to the editor. */
export function createDocumentAutoSaver<T>(persist:(value:T,previous:T)=>Promise<void>,notify:(key:string,status:DocumentSaveStatus)=>void,delay=700){
  type State={saved:string;latest:T;signature:string;timer?:ReturnType<typeof setTimeout>;chain:Promise<void>};
  const states=new Map<string,State>();
  const flush=(key:string):Promise<void>=>{
    const state=states.get(key);if(!state)return Promise.resolve();
    clearTimeout(state.timer);state.timer=undefined;
    state.chain=state.chain.catch(()=>{}).then(async()=>{
      const value=state.latest,signature=state.signature;
      if(signature===state.saved)return;
      notify(key,'saving');
      try{await persist(value,JSON.parse(state.saved) as T);state.saved=signature;notify(key,state.signature===signature?'saved':'pending');}
      catch(error){notify(key,'error');throw error;}
    });
    return state.chain;
  };
  return {
    loaded(key:string,value:T){const signature=JSON.stringify(value);states.set(key,{saved:signature,latest:value,signature,chain:Promise.resolve()});},
    schedule(key:string,value:T){
      const state=states.get(key);if(!state)return;
      const signature=JSON.stringify(value);if(signature===state.signature)return;
      state.latest=JSON.parse(signature) as T;state.signature=signature;
      clearTimeout(state.timer);notify(key,'pending');
      state.timer=setTimeout(()=>void flush(key).catch(()=>{}),delay);
    },
    flush,
    flushAll(){return Promise.all([...states.keys()].map(flush));},
  };
}
