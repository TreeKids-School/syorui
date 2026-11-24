import {professionalVariantSuffix} from '../lib/professionalPlanDraft';
import {parseProfessionalWorkbook, type ParsedPeriodData} from '../lib/professionalPlanImport';
import {ViewportModal} from './ViewportModal';
import React, { useState, useRef } from 'react';
import { X, FileSpreadsheet, AlertCircle, Check, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ProfessionalPlanDoc, ServiceHoursPlan } from '../types/professionalPlan';

type ProfessionalPlanImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImport: (plans: ProfessionalPlanDoc[], hours: ServiceHoursPlan[]) => void;
  childId: string;
};

export const ProfessionalPlanImportModal: React.FC<ProfessionalPlanImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  childId
}) => {
  const [parsedPeriods, setParsedPeriods] = useState<Record<string, ParsedPeriodData>>({});
  const [expandedHours, setExpandedHours] = useState<Record<string, boolean>>({});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [fileName, setFileName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        
        const result = parseProfessionalWorkbook(wb, childId);
        setParsedPeriods(result.periods);
        setDebugLogs(result.logs);
        setStep('preview');
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Excelファイルの解析に失敗しました。');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePeriodMonthChange = (oldMonth: string, newMonth: string) => {
    if (!newMonth || !/^\d{4}-\d{2}$/.test(newMonth)) return;
    
    setParsedPeriods(prev => {
      const next = { ...prev };
      const target = next[oldMonth];
      if (!target) return prev;

      delete next[oldMonth];
      
      const updatedTarget = {
        ...target,
        startMonth: newMonth,
      };

      if (updatedTarget.draftPlan) {
        updatedTarget.draftPlan.startMonth = newMonth;
        const [,, d] = (updatedTarget.draftPlan.createdAt || '').split('-');
        updatedTarget.draftPlan.createdAt = `${newMonth}-${d || '01'}`;
      }
      if (updatedTarget.finalPlan) {
        updatedTarget.finalPlan.startMonth = newMonth;
        const [,, d] = (updatedTarget.finalPlan.createdAt || '').split('-');
        updatedTarget.finalPlan.createdAt = `${newMonth}-${d || '01'}`;
      }
      if (updatedTarget.serviceHours) {
        updatedTarget.serviceHours.startMonth = newMonth;
        const [,, d] = (updatedTarget.serviceHours.createdAt || '').split('-');
        updatedTarget.serviceHours.createdAt = `${newMonth}-${d || '01'}`;
      }

      const newKey=newMonth+professionalVariantSuffix(target.variantIndex);
      if(next[newKey])return prev;
      next[newKey] = updatedTarget;
      return next;
    });
  };

  const handleToggleSkipImport = (month: string) => {
    setParsedPeriods(prev => {
      const target = prev[month];
      if (!target) return prev;
      return {
        ...prev,
        [month]: {
          ...target,
          skipImport: !target.skipImport
        }
      };
    });
  };

  const toggleHoursDetail = (month: string) => {
    setExpandedHours(prev => ({
      ...prev,
      [month]: !prev[month]
    }));
  };

  const handleExecuteImport = () => {
    const plans: ProfessionalPlanDoc[] = [];
    const hours: ServiceHoursPlan[] = [];

    Object.values(parsedPeriods).forEach(p => {
      if (p.skipImport) return; // インポートしない場合はスキップ
      if (p.draftPlan) plans.push(p.draftPlan);
      if (p.finalPlan) plans.push(p.finalPlan);
      if (p.serviceHours) hours.push(p.serviceHours);
    });

    if (plans.length === 0 && hours.length === 0) {
      alert('インポート対象が選択されていません。');
      return;
    }

    onImport(plans, hours);
    resetState();
  };

  const resetState = () => {
    setParsedPeriods({});
    setExpandedHours({});
    setDebugLogs([]);
    setError(null);
    setFileName('');
    setStep('upload');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      if (!isExcel) {
        setError('Excelファイル (.xlsx, .xls) のみを選択してください。');
        return;
      }
      processFile(file);
    }
  };

  return (
    <ViewportModal className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* ヘッダー */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">個別支援計画書 / 利用時間 インポート</h2>
              <p className="text-[12px] text-slate-500 font-medium">Excel内の全更新月シート（計画案・本案・利用時間）を一括読み込みします</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* コンテンツエリア */}
        <div className="flex-1 overflow-y-auto p-8">
          {step === 'upload' && (
            <div className="space-y-6">
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100 animate-shake">
                  <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-80 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 hover:border-green-500/40 hover:bg-slate-50/70 transition-all flex flex-col items-center justify-center p-6 cursor-pointer group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
                <div className="w-16 h-16 rounded-full bg-slate-100 group-hover:bg-green-50 text-slate-400 group-hover:text-green-600 transition-colors flex items-center justify-center mb-4">
                  <Upload size={28} />
                </div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight mb-2">Excelファイルをここにドラッグ＆ドロップ</h3>
                <p className="text-sm text-slate-400 font-semibold mb-6">または、クリックしてファイルを選択</p>
                <div className="text-xs text-slate-400/80 leading-relaxed text-center font-medium max-w-lg">
                  個別支援計画書（Search）および別表（利用時間）のシートが含まれるExcelファイルを選択してください。<br />
                  原本を除く「利用時間」「202506案」「202506」などの全シートが一括パースされます。
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 border border-slate-100 rounded-2xl p-5">
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">読み込み中のファイル</div>
                  <div className="text-sm font-bold text-slate-700">{fileName}</div>
                </div>
                
                <div className="space-y-1 text-right">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">解析された更新月数</div>
                  <div className="text-sm font-bold text-green-600">{Object.keys(parsedPeriods).length} ヶ月分</div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100">
                  <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {Object.keys(parsedPeriods).length > 0 && (
                <div className="space-y-6">
                  <h3 className="font-bold text-slate-700">検出された更新月・シートの一覧</h3>
                  
                  <div className="space-y-4">
                    {Object.entries(parsedPeriods)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([month, p]) => {
                        const isSkipped = p.skipImport === true;
                        const [yearVal, monthVal] = p.startMonth.split('-');
                        
                        return (
                          <div 
                            key={month} 
                            className={`border border-slate-200 rounded-2xl p-5 bg-slate-50/30 flex flex-col gap-4 transition-all duration-200 ${
                              isSkipped ? 'opacity-50 bg-slate-100/50 border-slate-100' : ''
                            }`}
                          >
                            {/* 上部メインコンテンツ */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div>
                                <div className="text-base font-black text-slate-800 flex flex-wrap items-center gap-3">
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={!isSkipped}
                                      onChange={() => handleToggleSkipImport(month)}
                                      className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500 accent-green-600 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-slate-600">インポートする</span>
                                  </label>
                                  
                                  <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
                                  
                                  <span className="shrink-0 text-sm">対象月{professionalVariantSuffix(p.variantIndex)}:</span>
                                  
                                  <div className="flex items-center gap-1">
                                    {/* 年の選択セレクト */}
                                    <select
                                      value={yearVal}
                                      disabled={isSkipped}
                                      onChange={(e) => {
                                        const newYear = e.target.value;
                                        handlePeriodMonthChange(month, `${newYear}-${monthVal || '01'}`);
                                      }}
                                      className="bg-white disabled:bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:border-green-500 transition-all cursor-pointer"
                                    >
                                      {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032].map(y => (
                                        <option key={y} value={y}>{y}年</option>
                                      ))}
                                    </select>

                                    {/* 月の選択セレクト */}
                                    <select
                                      value={monthVal}
                                      disabled={isSkipped}
                                      onChange={(e) => {
                                        const newMonth = e.target.value;
                                        handlePeriodMonthChange(month, `${yearVal || '2026'}-${newMonth}`);
                                      }}
                                      className="bg-white disabled:bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:border-green-500 transition-all cursor-pointer"
                                    >
                                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                                        <option key={m} value={m}>{parseInt(m, 10)}月</option>
                                      ))}
                                    </select>
                                  </div>
                                  
                                  <span className="text-xs text-slate-400 font-semibold">(対象月を変更できます)</span>
                                  {p.rawHoursDate && (
                                    <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100/50 shadow-sm">
                                      利用時間の作成日: {p.rawHoursDate}
                                    </span>
                                  )}
                                  {p.rawPlanDate && (
                                    <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 shadow-sm">
                                      計画書作成日: {p.rawPlanDate}
                                    </span>
                                  )}
                                </div>
                                
                                {p.hoursSheetName&&<p className="mt-3 text-sm text-blue-700">利用時間「{p.hoursSheetName}」 → {p.hoursEffectiveStart?'開始年月日 '+p.hoursEffectiveStart:p.hoursPlanSheetName?'本案「'+p.hoursPlanSheetName+'」の開始月':'シート内の年月'}（適用開始月 {p.startMonth}）</p>}
                                <div className="text-xs text-slate-500 font-medium mt-3 leading-relaxed">
                                  意向: {p.finalPlan?.familyIntention || p.draftPlan?.familyIntention || '未検出'} <br />
                                  方針: {p.finalPlan?.overallPolicy || p.draftPlan?.overallPolicy || '未検出'}
                                </div>
                              </div>

                              <div className="flex gap-2 flex-wrap items-center">
                                {p.serviceHours && (
                                  <button 
                                    onClick={() => toggleHoursDetail(month)}
                                    className="text-[11px] font-bold px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl border border-blue-100 flex items-center gap-1.5 transition-all shadow-sm"
                                  >
                                    <Check size={12} /> 利用時間 (別表)
                                    <span className="text-[10px] text-blue-500 underline ml-1 font-semibold">
                                      {expandedHours[month] ? '閉じる' : '詳細を確認'}
                                    </span>
                                  </button>
                                )}
                                {p.draftPlan && (
                                  <span className="text-[11px] font-bold px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 flex items-center gap-1">
                                    <Check size={12} /> 計画書 (案)
                                  </span>
                                )}
                                {p.finalPlan && (
                                  <span className="text-[11px] font-bold px-3 py-1.5 bg-green-50 text-green-700 rounded-xl border border-green-100 flex items-center gap-1">
                                    <Check size={12} /> 計画書 (本案)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 利用時間のパース詳細アコーディオン */}
                            {p.serviceHours && expandedHours[month] && (
                              <div className="p-4 bg-blue-50/20 border border-blue-100/50 rounded-xl space-y-3 text-xs animate-in slide-in-from-top-2 duration-200">
                                <h4 className="font-bold text-blue-800 flex items-center gap-1.5">
                                  <span>利用時間（別表）のパース詳細</span>
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-normal">
                                    {p.serviceHours.createdAt ? `作成日: ${p.serviceHours.createdAt}` : '作成日不明'}
                                  </span>
                                </h4>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                                  {['月', '火', '水', '木', '金', '土', '日'].map(day => {
                                    const sched = p.serviceHours?.weeklyHours[day];
                                    const hasService = sched && (sched.startTime || sched.endTime);
                                    
                                    return (
                                      <div key={day} className={`p-2 rounded-lg border transition-all ${
                                        hasService ? 'bg-white border-blue-200 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-400'
                                      }`}>
                                        <div className="font-bold text-center border-b border-slate-100 pb-1 mb-1">{day}曜</div>
                                        {hasService ? (
                                          <div className="space-y-1 text-[11px]">
                                            <div className="font-semibold text-slate-700 text-center">{sched.startTime}~{sched.endTime}</div>
                                            {(sched.beforeExtMinutes > 0 || sched.afterExtMinutes > 0) && (
                                              <div className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded text-center font-bold">
                                                {sched.beforeExtMinutes > 0 && `前:${sched.beforeExtMinutes}分 `}
                                                {sched.afterExtMinutes > 0 && `後:${sched.afterExtMinutes}分`}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-center py-2 text-[10px]">─</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                
                                {(p.serviceHours.extReason || p.serviceHours.notes) && (
                                  <div className="grid md:grid-cols-2 gap-3 pt-2 border-t border-blue-100 text-[11px]">
                                    {p.serviceHours.extReason && (
                                      <div>
                                        <span className="font-bold text-slate-500">延長を必要とする理由: </span>
                                        <span className="text-slate-700 bg-white px-2 py-0.5 rounded border border-blue-100/50 inline-block mt-0.5">{p.serviceHours.extReason}</span>
                                      </div>
                                    )}
                                    {p.serviceHours.notes && (
                                      <div>
                                        <span className="font-bold text-slate-500">特記事項: </span>
                                        <span className="text-slate-700 bg-white px-2 py-0.5 rounded border border-blue-100/50 inline-block mt-0.5">{p.serviceHours.notes}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* 解析デバッグログ */}
              {debugLogs.length > 0 && (
                <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
                  <div className="p-4 bg-slate-100/80 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-black text-slate-700">Excel解析レポート (デバッグログ)</span>
                    <span className="text-[10px] text-slate-400 font-semibold">利用時間や計画書の読み込み履歴</span>
                  </div>
                  <div className="p-4 font-mono text-[11px] text-slate-600 space-y-1.5 max-h-60 overflow-y-auto leading-relaxed bg-white">
                    {debugLogs.map((log, idx) => (
                      <div key={idx} className={`pb-1 border-b border-slate-50 last:border-0 ${
                        log.includes('エラー') || log.includes('警告') ? 'text-rose-600 font-semibold' : 
                        log.includes('成功') || log.includes('特定しました') || log.includes('検出') ? 'text-green-600' : 'text-slate-600'
                      }`}>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッターボタン */}
        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
          <button 
            onClick={() => {
              resetState();
              onClose();
            }} 
            className="px-6 py-2.5 text-slate-500 font-bold hover:text-slate-800 transition-colors"
          >
            キャンセル
          </button>
          
          {step === 'preview' && (
            <>
              <button 
                onClick={resetState}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all active:scale-95"
              >
                ファイルを変更
              </button>
              <button 
                onClick={handleExecuteImport}
                className="px-8 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 flex items-center gap-2 active:scale-95"
              >
                <Check size={18} />
                <span>一括登録を実行する</span>
              </button>
            </>
          )}
        </div>
      </div>
    </ViewportModal>
  );
};
