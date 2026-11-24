import {ResultWorkflowTools} from './ResultWorkflowTools';
import {ViewportModal} from './ViewportModal';
import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Sparkles } from 'lucide-react';
import type { DailyReport } from '../types/supportPlan';

interface ResultImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthStr: string; // "YYYY-MM"
  existingRows: DailyReport[]; // 既存の登録データ
  onGetSource:()=>string|Promise<string>;
  onImport: (results: Record<string, string>) => void;
}

interface ParsedResult {
  date: string;
  originalDate: string;
  resultText: string;
}

const normalizeDateStr = (str: string): string => {
  const matchKanji = str.match(/(\d+)月\s*(\d+)日/);
  if (matchKanji) {
    return `${parseInt(matchKanji[1], 10)}月${parseInt(matchKanji[2], 10)}日`;
  }
  const matchSlash = str.match(/(\d+)\/(\d+)/);
  if (matchSlash) {
    return `${parseInt(matchSlash[1], 10)}月${parseInt(matchSlash[2], 10)}日`;
  }
  const matchHyphen = str.match(/(\d+)-(\d+)/);
  if (matchHyphen) {
    return `${parseInt(matchHyphen[1], 10)}月${parseInt(matchHyphen[2], 10)}日`;
  }
  return str;
};

const parseImportedResults = (text: string): ParsedResult[] => {
  const list: ParsedResult[] = [];
  const lines = text.split('\n');
  let currentDate = '';
  let currentContent: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) continue;

    // 「■ 4月1日」や「【4月1日】」、「8/1」などの日付パターンにマッチするか確認
    const dateMatch = trimmed.match(/^(?:■|【)?\s*(\d+月\d+日|\d+[-/]\d+)\s*(?:】|:|：)?$/) 
      || trimmed.match(/^■\s*(\d+月\d+日|\d+[-/]\d+)/)
      || trimmed.match(/^【\s*(\d+月\d+日|\d+[-/]\d+)\s*】/);
      
    if (dateMatch) {
      if (currentDate && currentContent.length > 0) {
        list.push({
          date: normalizeDateStr(currentDate),
          originalDate: currentDate,
          resultText: currentContent.join('\n').trim()
        });
      }
      currentDate = dateMatch[1];
      currentContent = [];
    } else {
      if (currentDate) {
        currentContent.push(line);
      }
    }
  }

  if (currentDate && currentContent.length > 0) {
    list.push({
      date: normalizeDateStr(currentDate),
      originalDate: currentDate,
      resultText: currentContent.join('\n').trim()
    });
  }

  return list;
};

export const ResultImportModal: React.FC<ResultImportModalProps> = ({
  isOpen,
  onClose,
  monthStr,
  existingRows,
  onGetSource,
  onImport
}) => {
  const [inputText, setInputText] = useState('');
  const [parsedList, setParsedList] = useState<ParsedResult[]>([]);
  const [overwriteMap, setOverwriteMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setInputText('');
      setParsedList([]);
      setOverwriteMap({});
    }
  }, [isOpen]);

  useEffect(() => {
    if (inputText.trim()) {
      const parsed = parseImportedResults(inputText);
      setParsedList(parsed);

      const map: Record<string, boolean> = {};
      parsed.forEach(item => {
        const exist = existingRows.find(r => r.date === item.date);
        const hasExistVal = exist?.content?.resultInfo?.trim();
        // 既存値がある場合はデフォルトで上書き無効(false)、なければ自動登録(true)
        map[item.date] = !hasExistVal;
      });
      setOverwriteMap(map);
    } else {
      setParsedList([]);
      setOverwriteMap({});
    }
  }, [inputText, existingRows]);

  if (!isOpen) return null;

  const [year, month] = monthStr.split('-');
  const formattedMonth = `${year}年${parseInt(month, 10)}月`;

  const handleExecuteImport = () => {
    if (parsedList.length === 0) return;
    const resultObj: Record<string, string> = {};
    parsedList.forEach(item => {
      // ユーザーが上書き許可（または新規）の項目のみ
      if (overwriteMap[item.date]) {
        resultObj[item.date] = item.resultText;
      }
    });
    onImport(resultObj);
  };

  const hasLengthError = parsedList.some(item => item.resultText.length > 140);
  const totalRecordCount = parsedList.length;
  // インポート実行対象の件数
  const importTargetCount = parsedList.filter(item => overwriteMap[item.date]).length;

  return (
    <ViewportModal className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-scale-up">
        {/* ヘッダー */}
        <div className="bg-slate-50 border-b border-slate-200/60 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles size={20} className="text-primary" />
            <h3 className="font-black text-slate-800 text-lg">療育結果の確認・登録 ({formattedMonth}分)</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <ResultWorkflowTools key={monthStr+String(isOpen)} month={monthStr} onGetSource={onGetSource}/>

          {/* 入力とプレビューの2列レイアウト */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[300px]">
            {/* 入力エリア */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700">
                2. Geminiの出力結果を貼り付け
              </label>
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}

                className="flex-1 w-full p-4 border border-slate-300 rounded-xl outline-none resize-none font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary min-h-[250px] lg:min-h-0"
              />
            </div>

            {/* プレビューエリア */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700">
                  解析プレビュー
                </label>
                <span className="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                  解析数: {totalRecordCount}件 (内 {importTargetCount}件登録対象)
                </span>
              </div>

              {parsedList.some(item => {
                const exist = existingRows.find(r => r.date === item.date);
                return !!exist?.content?.resultInfo?.trim();
              }) && (
                <div className="flex items-center gap-2.5 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-900">
                  <span className="font-bold shrink-0">既存データ一括設定:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newMap = { ...overwriteMap };
                      parsedList.forEach(item => {
                        const exist = existingRows.find(r => r.date === item.date);
                        if (exist?.content?.resultInfo?.trim()) {
                          newMap[item.date] = true;
                        }
                      });
                      setOverwriteMap(newMap);
                    }}
                    className="text-primary hover:underline font-extrabold cursor-pointer"
                  >
                    すべて上書きする
                  </button>
                  <span className="text-amber-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newMap = { ...overwriteMap };
                      parsedList.forEach(item => {
                        const exist = existingRows.find(r => r.date === item.date);
                        if (exist?.content?.resultInfo?.trim()) {
                          newMap[item.date] = false;
                        }
                      });
                      setOverwriteMap(newMap);
                    }}
                    className="text-slate-600 hover:underline font-extrabold cursor-pointer"
                  >
                    上書きしない
                  </button>
                </div>
              )}

              <div className="flex-1 border border-slate-200 rounded-xl bg-slate-50/50 p-4 overflow-y-auto max-h-[350px] lg:max-h-none min-h-[250px] lg:min-h-0">
                {parsedList.length === 0 ? null : (
                  <div className="space-y-4">
                    {parsedList.map((item, idx) => {
                      const isOverLimit = item.resultText.length > 140;
                      const exist = existingRows.find(r => r.date === item.date);
                      const existVal = exist?.content?.resultInfo?.trim();
                      const hasExistVal = !!existVal;
                      const shouldOverwrite = overwriteMap[item.date] || false;

                      return (
                        <div 
                          key={idx} 
                          className={`bg-white border rounded-xl p-4 shadow-2xs space-y-2.5 transition-all ${
                            hasExistVal 
                              ? (shouldOverwrite ? 'border-amber-300 bg-amber-50/10' : 'border-slate-200 bg-slate-100/50 opacity-75') 
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                              {item.date}
                            </span>
                            <span className={`text-[10px] font-bold ${isOverLimit ? 'text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-100' : 'text-slate-400'}`}>
                              {item.resultText.length} / 140文字
                            </span>
                          </div>

                          {/* 既存の療育結果がある場合 */}
                          {hasExistVal && (
                            <div className="bg-amber-50/40 border border-amber-250 rounded-lg p-3 space-y-2 text-xs leading-relaxed">
                              <div className="flex items-center justify-between">
                                <span className="text-amber-800 font-extrabold flex items-center gap-1">
                                  <AlertTriangle size={12} className="shrink-0" />
                                  既存の療育結果あり
                                </span>
                                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-900 select-none">
                                  <input
                                    type="checkbox"
                                    checked={shouldOverwrite}
                                    onChange={e => setOverwriteMap(prev => ({ ...prev, [item.date]: e.target.checked }))}
                                    className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                  />
                                  上書きする
                                </label>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">現在登録されている内容：</p>
                                <p className="text-slate-500 italic whitespace-pre-wrap">{existVal}</p>
                              </div>
                              <div className="space-y-1 border-t border-amber-200/50 pt-2">
                                <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">上書き後の内容：</p>
                                <p className={shouldOverwrite ? 'text-slate-800 font-medium' : 'text-slate-400 line-through'}>
                                  {item.resultText}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 既存の療育結果がない場合 */}
                          {!hasExistVal && (
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                              {item.resultText}
                            </p>
                          )}

                          {isOverLimit && (
                            <p className="text-[10px] text-red-500 font-semibold flex items-center gap-1 mt-1">
                              <AlertTriangle size={10} />
                              140文字を超えています。計画書の表示幅からはみ出す可能性があります。
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex gap-3 justify-end shrink-0">
          {hasLengthError && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl mr-auto">
              <AlertTriangle size={14} />
              <span>140文字を超えている項目があります。</span>
            </div>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={handleExecuteImport}
            disabled={importTargetCount === 0}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all text-white ${
              importTargetCount === 0 
                ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            {importTargetCount} 件を登録・上書きする
          </button>
        </div>
      </div>
    </ViewportModal>
  );
};
