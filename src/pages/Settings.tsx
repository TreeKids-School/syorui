import {ProfessionalManagerSettings} from '../components/ProfessionalManagerSettings';
import {DocumentIcon} from '../components/DocumentIcon';
import {ProfessionalPlanBulkImportModal} from '../components/ProfessionalPlanBulkImportModal';
import {SettingsGroup} from '../components/SettingsGroup';
import React, { useState, useEffect } from 'react';
import {StaffAccountBadge} from '../components/StaffAccountBadge';
import { 
  Save, Calendar, User, CheckCircle2, Settings as SettingsIcon, 
  LogOut
} from 'lucide-react';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import type { Child } from '../data/mockData';

import { getMonthlySettings, monthlySettingsRef } from '../lib/monthlySettings';

type MonthlySetting = {
  implementationCreator: string;
  implementationYear: string;
  implementationMonth: string;
  implementationDay: string;
  perspectiveCreator: string;
  perspectiveYear: string;
  perspectiveMonth: string;
  perspectiveDay: string;
};

type SettingsProps = {
  childrenData?: Child[];
  selectedOfficeId: string;
  offices: { id: string; name: string }[];
  onOfficeChange: (id: string) => void;
};

export const Settings: React.FC<SettingsProps> = ({ childrenData = [], selectedOfficeId, offices, onOfficeChange }) => {
  const [managerSettingsOpen,setManagerSettingsOpen]=useState(false);
  const [bulkImportOpen,setBulkImportOpen]=useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSignOutError('');
    try {
      await auth.signOut();
    } catch {
      setSignOutError('ログアウトできませんでした。もう一度お試しください。');
      setIsSigningOut(false);
    }
  };
  const [activeTab, setActiveTab] = useState<'implementation' | 'perspective'>('implementation');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [settings, setSettings] = useState<MonthlySetting>({
    implementationCreator: '',
    implementationYear: '',
    implementationMonth: '',
    implementationDay: '',
    perspectiveCreator: '',
    perspectiveYear: '',
    perspectiveMonth: '',
    perspectiveDay: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadedSettingsKey, setLoadedSettingsKey] = useState('');
  const settingsKey = `${selectedOfficeId}_${selectedMonth}`;
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // データ取得 (月次設定)
  useEffect(() => {
    let cancelled = false;
    const fetchSettings = async () => {
      setIsLoading(true);
      setSaveStatus('idle');
      setLoadedSettingsKey('');
      try {
        const snap = await getMonthlySettings(selectedOfficeId, selectedMonth);
        if (cancelled) return;
        if (snap.exists()) {
          setSettings({ implementationCreator: '', implementationYear: '', implementationMonth: selectedMonth.split('-')[1], implementationDay: '', perspectiveCreator: '', perspectiveYear: '', perspectiveMonth: selectedMonth.split('-')[1], perspectiveDay: '', ...snap.data() } as MonthlySetting);
        } else {
          // デフォルト値: 月選択から月を抽出
          const m = parseInt(selectedMonth.split('-')[1], 10);
          setSettings({
            implementationCreator: '',
            implementationYear: '',
            implementationMonth: m.toString(),
            implementationDay: '',
            perspectiveCreator: '',
            perspectiveYear: '',
            perspectiveMonth: m.toString(),
            perspectiveDay: '',
          });
        }
        setLoadedSettingsKey(`${selectedOfficeId}_${selectedMonth}`);
      } catch (e) {
        if (cancelled) return;
        console.error('fetchSettings error:', e);
        setSaveStatus('error');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchSettings();
    return () => { cancelled = true; };
  }, [selectedMonth, selectedOfficeId]);

  // 設定の保存
  const handleSave = async () => {
    if (loadedSettingsKey !== settingsKey || !selectedOfficeId) return;
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      await setDoc(monthlySettingsRef(selectedOfficeId, selectedMonth), {
        officeId: selectedOfficeId,
        month: selectedMonth,
        ...settings,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error('Save error:', e);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (patch: Partial<MonthlySetting>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-8 pb-20 animate-fade-in">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">システム設定</h1>
            <p className="text-sm text-slate-500">書類の基本パラメータの管理や、エクセルデータの一括インポートを行います</p>
          </div>
        </div>
        
        {(
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || loadedSettingsKey !== settingsKey}
            className={`btn-primary flex items-center gap-2 px-6 py-2.5 shadow-lg shadow-primary/20 transition-all active:scale-95 ${
              saveStatus === 'success' ? 'bg-emerald-500 hover:bg-emerald-600' : ''
            }`}
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle2 size={20} />
            ) : (
              <Save size={20} />
            )}
            <span>{isSaving ? '保存中...' : saveStatus === 'success' ? '保存完了' : '設定を保存'}</span>
          </button>
        )}
      </div>

      {/* メインレイアウト */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* 事業所・対象月ごとの設定 */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="glass-panel p-6 bg-white/50 border-primary/10">
            <label className="block text-sm font-bold text-slate-600 mb-5">
              設定する事業所
              <select aria-label="設定する事業所" value={selectedOfficeId} onChange={e => onOfficeChange(e.target.value)} disabled={isSaving} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base">
                {offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}
              </select>
            </label>
            <p className="mb-4 text-xs text-slate-500">作成者・作成日は、選択した事業所と対象月に適用されます。</p>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calendar size={16} /> 対象月の選択
            </h3>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <p className="mt-3 text-xs text-slate-400 leading-relaxed text-center">
              設定の適用月、および一括インポートするエクセルデータの対象月を指定します。
            </p>
          </div>
        </div>

        {/* 右サイド: 各設定 / インポートフォーム */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="glass-panel overflow-hidden border-primary/5 bg-white/80 shadow-xl shadow-slate-200/50 flex flex-col min-h-[600px]">
            {/* タブ */}
            <div className="flex border-b border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setActiveTab('implementation')}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all ${
                  activeTab === 'implementation'
                    ? 'bg-white text-primary border-b-2 border-primary shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <DocumentIcon type="implementation"/> 専門的支援実施計画
              </button>
              <button
                onClick={() => setActiveTab('perspective')}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all ${
                  activeTab === 'perspective'
                    ? 'bg-white text-primary border-b-2 border-primary shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <DocumentIcon type="professional"/> 個別支援計画書
              </button>
            </div>

            <div className="p-8 flex-1 flex flex-col">
              {(
                isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 flex-1">
                    <div className="w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                    <p className="text-slate-400 font-medium">設定を読み込み中...</p>
                  </div>
                ) : (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                    {/* 作成日設定 */}
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        デフォルト作成年月日
                      </label>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="relative group">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold pointer-events-none group-focus-within:text-primary transition-colors">令和</span>
                          <input
                            type="number"
                            value={activeTab === 'implementation' ? settings.implementationYear : settings.perspectiveYear}
                            onChange={(e) => updateSettings({ 
                              [activeTab === 'implementation' ? 'implementationYear' : 'perspectiveYear']: e.target.value 
                            })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-10 pr-6 font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-right"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">年</span>
                        </div>
                        <div className="relative group">
                          <input
                            type="number"
                            value={activeTab === 'implementation' ? settings.implementationMonth : settings.perspectiveMonth}
                            onChange={(e) => updateSettings({ 
                              [activeTab === 'implementation' ? 'implementationMonth' : 'perspectiveMonth']: e.target.value 
                            })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 px-4 font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-right pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">月</span>
                        </div>
                        <div className="relative group">
                          <input
                            type="number"
                            value={activeTab === 'implementation' ? settings.implementationDay : settings.perspectiveDay}
                            onChange={(e) => updateSettings({ 
                              [activeTab === 'implementation' ? 'implementationDay' : 'perspectiveDay']: e.target.value 
                            })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 px-4 font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-right pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">日作成</span>
                        </div>
                      </div>
                    </div>

                    {/* 作成者設定 */}
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        作成者
                      </label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                          <User size={20} />
                        </div>
                        <input
                          type="text"
                          placeholder="作成者名を入力"
                          value={activeTab === 'implementation' ? settings.implementationCreator : settings.perspectiveCreator}
                          onChange={(e) => updateSettings({ 
                            [activeTab === 'implementation' ? 'implementationCreator' : 'perspectiveCreator']: e.target.value 
                          })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all"
                        />
                      </div>
                    </div>

                    {/* プレビュー */}
                    <div className="mt-12 p-6 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">表示プレビュー</div>
                      <div className="flex flex-col md:flex-row md:items-center gap-2 text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>令和</span>
                          <span className="text-primary font-bold text-lg">{activeTab === 'implementation' ? settings.implementationYear || '?' : settings.perspectiveYear || '?'}</span>
                          <span>年</span>
                          <span className="text-primary font-bold text-lg">{activeTab === 'implementation' ? settings.implementationMonth || '?' : settings.perspectiveMonth || '?'}</span>
                          <span>月</span>
                          <span className="text-primary font-bold text-lg">{activeTab === 'implementation' ? settings.implementationDay || '?' : settings.perspectiveDay || '?'}</span>
                          <span>日作成</span>
                        </div>
                        <span className="hidden md:inline mx-2 text-slate-300">|</span>
                        <div className="flex items-center gap-1.5">
                          <span>作成者：</span>
                          <span className="text-primary font-bold text-lg underline decoration-primary/20 decoration-2 underline-offset-4">
                            {activeTab === 'implementation' ? settings.implementationCreator || '未設定' : settings.perspectiveCreator || '未設定'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {activeTab==='perspective'&&<SettingsGroup title="署名欄の設定"><button type="button" onClick={()=>setManagerSettingsOpen(true)} className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700"><DocumentIcon type="professional"/>児童発達支援管理責任者氏名の設定</button></SettingsGroup>}
      {managerSettingsOpen&&<ProfessionalManagerSettings key={selectedOfficeId} officeId={selectedOfficeId} officeName={offices.find(office=>office.id===selectedOfficeId)?.name||selectedOfficeId} onSaved={()=>{}} onClose={()=>setManagerSettingsOpen(false)}/>}
      <SettingsGroup title="初回データ移行"><button type="button" onClick={()=>setBulkImportOpen(true)} className="w-full p-4 text-left text-sm text-slate-700"><span className="flex items-center gap-3 font-semibold"><DocumentIcon type="professional"/>個別支援計画書をExcelから一括インポート</span><span className="mt-1 block text-xs text-slate-500">フォルダ内の全児童・全期間の本案・案・利用時間を、対応一覧で確認して取り込みます。</span></button></SettingsGroup>
      {bulkImportOpen && <ProfessionalPlanBulkImportModal childrenData={childrenData} officeId={selectedOfficeId} officeName={offices.find(o=>o.id===selectedOfficeId)?.name||selectedOfficeId} onClose={()=>setBulkImportOpen(false)} />}
      <section aria-label="アカウント" className="glass-panel p-6 flex flex-col gap-3 print:hidden">
        <h2 className="text-base font-bold text-slate-800">アカウント</h2>
        <StaffAccountBadge />
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex items-center justify-center gap-2 self-start min-h-12 px-5 py-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          <LogOut size={18} />
          {isSigningOut ? 'ログアウト中...' : 'ログアウト'}
        </button>
        {signOutError && <p role="alert" className="text-sm text-red-600">{signOutError}</p>}
      </section>

      {/* フッターヒント */}
      <div className="flex items-center justify-center gap-6 py-8 border-t border-slate-100">
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          自動保存はされません（一括登録除く）
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          設定は全児童に反映されます
        </div>
      </div>
    </div>
  );
};
