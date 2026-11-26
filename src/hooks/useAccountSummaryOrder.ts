import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {doc,getDocFromServer,setDoc} from 'firebase/firestore';
import {auth,db} from '../lib/firebase';
import {measureRead} from '../lib/readDiagnostics';
import {createAccountSummaryOrderStore} from '../lib/accountSummaryOrderModel';
const stores=new Map<string,ReturnType<typeof createAccountSummaryOrderStore>>();
export function useAccountSummaryOrder(uid:string){
  const store=useMemo(()=>{let value=stores.get(uid);if(!value){
    value=createAccountSummaryOrderStore(async()=>{if(!uid)return 'original';const snapshot=await measureRead('アカウントの並べ替え設定',getDocFromServer(doc(db,'staff',uid,'app_preferences','document_management')));return snapshot.data()?.summaryChildOrder;},async order=>{if(!uid||auth.currentUser?.uid!==uid)throw new Error('アカウントを確認できません。');await setDoc(doc(db,'staff',uid,'app_preferences','document_management'),{summaryChildOrder:order},{merge:true});});stores.set(uid,value);
  }return value;},[uid]);
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  useEffect(()=>{if(uid)void store.load();},[store,uid]);
  return {childOrder:snapshot.order,setChildOrder:store.setOrder,orderPreferenceError:snapshot.error};
}
