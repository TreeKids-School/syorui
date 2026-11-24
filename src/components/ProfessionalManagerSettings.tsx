import {useEffect,useState} from 'react';
import {getProfessionalManager,saveProfessionalManager,cleanProfessionalManagerName} from '../lib/professionalManager';
import {ViewportModal} from './ViewportModal';
import {SettingsGroup} from './SettingsGroup';

export function ProfessionalManagerSettings({officeId,officeName,currentName,onSaved,onClose}:{officeId:string;officeName:string;currentName?:string;onSaved:(name:string,apply:boolean)=>void;onClose:()=>void}){
  const [name,setName]=useState(''),[apply,setApply]=useState(true),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let cancelled=false;getProfessionalManager(officeId,true).then(value=>{if(!cancelled){setName(value||cleanProfessionalManagerName(currentName));setLoaded(true);}}).catch(()=>{if(!cancelled)setError('設定を読み込めませんでした。開き直してください。');}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[officeId]);
  return <ViewportModal className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-900/50 p-4"><form role="dialog" aria-modal="true" aria-labelledby="manager-settings-title" className="max-h-[90dvh] w-full max-w-lg space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onSubmit={async event=>{event.preventDefault();if(loading||!loaded||saving)return;setSaving(true);setError('');try{const value=await saveProfessionalManager(officeId,name);onSaved(value,apply);onClose();}catch{setError('保存できませんでした。もう一度お試しください。');}finally{setSaving(false);}}}>
    <h2 id="manager-settings-title" className="text-lg font-bold">管理責任者氏名の設定</h2>
    <SettingsGroup title="事業所"><p className="px-4 py-3 text-sm">{officeName}</p></SettingsGroup>
    <SettingsGroup title="個別支援計画書の署名欄"><label className="block space-y-2 p-4 text-sm"><span>児童発達支援管理責任者氏名</span><input disabled={loading||!loaded||saving} value={name} onChange={event=>setName(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-primary" placeholder="氏名のみ入力"/></label></SettingsGroup>
    <p className="text-xs leading-relaxed text-slate-500">この事業所の新しい計画書と、氏名が空欄の計画書に使います。「印」は入力不要です。</p>
    {currentName!==undefined&&<label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={loading||saving} checked={apply} onChange={event=>setApply(event.target.checked)}/>表示中の計画書にも反映する</label>}
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded-xl border px-4 text-sm">キャンセル</button><button type="submit" disabled={loading||!loaded||saving} className="min-h-10 rounded-xl bg-primary px-4 text-sm text-white disabled:opacity-50">{loading?'読み込み中…':saving?'保存中…':'設定を保存'}</button></div>
  </form></ViewportModal>;
}
