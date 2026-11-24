import {measureReads} from '../lib/readDiagnostics';
import {ViewportModal} from './ViewportModal';
import { SettingsFeature, SettingsGroup, settingsRowClass } from './SettingsGroup';
import { getMonthlySettings } from '../lib/monthlySettings';
import { excelExportOfficePriority } from '../lib/excelExportOfficeScope';
import {officeAttendanceDates, supportDateKey} from '../lib/supportOfficeAttendance';
import {collectOfficeFuturePlans, supplementSupportFutureRows} from '../lib/supportFuturePlans';
import {getMonthlyTreeCommunications} from '../lib/monthlyTreeCommunications';
import React, { useState, useMemo } from 'react';
import { 
  FolderOpen, FileSpreadsheet, CheckCircle2, AlertCircle, 
  Loader2, Check, X
} from 'lucide-react';
import { collection, query, where, getDocs as firestoregetDocs, doc, getDoc as firestoregetDoc, documentId } from 'firebase/firestore';
const getDocs=measureReads('Excel一括上書き',firestoregetDocs);
const getDoc=measureReads('Excel一括上書き',firestoregetDoc);

import { db } from '../lib/firebase';
import type { Child } from '../data/mockData';
import type { DailyReport } from '../types/supportPlan';
import { cloneTemplateAndWriteExcelFile, existingExcelRows } from '../lib/excelExport';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { OneTimeExcelDateRepair } from './OneTimeExcelDateRepair';

interface BatchExcelExportProps {
  selectedMonth: string; // "YYYY-MM"
  childrenData: Child[];
  selectedOfficeId: string;
}

interface ScannedExcelItem {
  fileHandle: any;
  fileName: string;
  matchedChild: Child | null;
  hasTemplateSheet: boolean;
  targetSheetName: string;
  existingSheetNames: string[];
  goals: string;
  dailyRows: DailyReport[];
  hasData: boolean;
  status: 'ready' | 'no-child' | 'no-data' | 'no-template' | 'success' | 'error';
  errorMessage?: string;
  selected: boolean;
}

export const BatchExcelExport: React.FC<BatchExcelExportProps> = ({
  selectedMonth: initialMonth,
  childrenData,
  selectedOfficeId
}) => {
  const [targetMonth, setTargetMonth] = useState<string>(initialMonth || new Date().toISOString().slice(0, 7));
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; fileName: string }>({
    current: 0,
    total: 0,
    fileName: ''
  });
  const [scannedItems, setScannedItems] = useState<ScannedExcelItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; currentFileName: string }>({
    current: 0,
    total: 0,
    currentFileName: ''
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [monthSettings, setMonthSettings] = useState<{
    creator: string;
    createdDateText: string;
  }>({ creator: '', createdDateText: '' });
  const [loadedSettingsKey, setLoadedSettingsKey] = useState('');
  const [scanContext, setScanContext] = useState<{ key: string; creator: string; createdDateText: string; directoryHandle: any } | null>(null);
  const settingsKey = `${selectedOfficeId}_${targetMonth}`;
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const [downloadMode, setDownloadMode] = useState(false);
  const [folderMessage, setFolderMessage] = useState('');
  const [isPicking, setIsPicking] = useState(false);

  // 月変更時の同期
  React.useEffect(() => {
    if (initialMonth) {
      setTargetMonth(initialMonth);
    }
  }, [initialMonth]);

  // 該当月のシステム設定（専門的支援実施計画の作成日・作成者）を取得
  React.useEffect(() => {
    let cancelled = false;
    setLoadedSettingsKey('');
    setMonthSettings({ creator: '', createdDateText: '' });
    const fetchMonthlySettings = async () => {
      try {
        const snap = await getMonthlySettings(selectedOfficeId, targetMonth);
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          const y = data.implementationYear;
          const m = data.implementationMonth;
          const d = data.implementationDay;
          const creator = data.implementationCreator || '';
          let dateText = '';
          if (y && m && d) {
            dateText = `令和${y}年${m}月${d}日作成`;
          } else if (y || m || d) {
            dateText = `令和${y || ''}年${m || ''}月${d || ''}日作成`;
          }
          setMonthSettings({ creator, createdDateText: dateText });
        } else {
          setMonthSettings({ creator: '', createdDateText: '' });
        }
        setLoadedSettingsKey(`${selectedOfficeId}_${targetMonth}`);
      } catch (err) {
        console.error('Failed to fetch monthly settings:', err);
      }
    };
    fetchMonthlySettings();
    return () => { cancelled = true; };
  }, [targetMonth, selectedOfficeId]);

  // 名前の正規化
  const normalize = (s?: string) => (s || '').replace(/[\s　\u200B-\u200D\uFEFF]/g, '').toLowerCase();

  // 児童の照合ロジック
  const matchChild = (rawName: string, fileName: string): Child | null => {
    const normRaw = normalize(rawName);
    const normFile = normalize(fileName);

    // 1. 検出された氏名で完全一致
    if (normRaw) {
      const c1 = childrenData.find(c => normalize(c.fullName) === normRaw);
      if (c1) return c1;
      const c2 = childrenData.find(c => normalize(c.nameKana) === normRaw);
      if (c2) return c2;
      const c3 = childrenData.find(c => {
        const full = normalize(c.fullName);
        return !!full && (full.includes(normRaw) || normRaw.includes(full));
      });
      if (c3) return c3;
    }

    // 2. ファイル名から照合
    const cFile = childrenData.find(c => {
      const full = normalize(c.fullName);
      const kana = normalize(c.nameKana);
      return (full && normFile.includes(full)) || (kana && normFile.includes(kana));
    });
    if (cFile) return cFile;

    return null;
  };

  // フォルダ選択とスキャン処理
  const handleSelectFolder = async (selectedFiles?: File[]) => {
    if (!selectedOfficeId || loadedSettingsKey !== settingsKey) {
      alert('対象事業所の設定を読み込めていません。設定画面を開き直してください。');
      return;
    }
    const exportContext = { key: settingsKey, ...monthSettings };
    if (!selectedFiles && !('showDirectoryPicker' in window)) {
      alert('お使いのブラウザはフォルダ選択機能（File System Access API）に対応していません。Google Chrome または Microsoft Edge でご利用ください。');
      return;
    }

    try {
      setFolderMessage('');
      setIsPicking(!selectedFiles);
      // 照合時は読み取りだけ許可を求め、書き込みは実行ボタンのクリック時に求める。
      const dirHandle = selectedFiles ? null : await (window as any).showDirectoryPicker({mode: 'read'});
      setIsPicking(false);
      setDownloadMode(!!selectedFiles);

      setIsScanning(true);
      setScannedItems([]);
      setScanProgress({ current: 0, total: 0, fileName: '' });
      setLogs(['フォルダ内のExcelファイルを検索中…']);

      const excelFiles: any[] = [];
      const entries = selectedFiles ? selectedFiles.map(file => ({kind: 'file', name: file.name, getFile: async () => file})) : dirHandle.values();
      for await (const entry of entries) {
        if (entry.kind === 'file' && /\.xlsx?$/i.test(entry.name) && !entry.name.startsWith('~$')) {
          excelFiles.push(entry);
        }
      }

      if (excelFiles.length === 0) {
        alert('指定されたフォルダ内に有効なエクセルファイル (.xlsx) が見つかりませんでした。');
        setIsScanning(false);
        return;
      }

      setLogs(prev => [...prev, `${excelFiles.length}件のエクセルファイルを検出しました。児童照合とデータ取得を開始します...`]);

      const [yStr, mStr] = targetMonth.split('-');
      const baseSheetName = `${yStr}${(mStr || '01').padStart(2, '0')}`;

      // Firestore から今月分の supportPlans と daily_reports を一括取得（ネットワークを劇的に高速化）
      const goalsMap = new Map<string, string>();
      const goalPriorities = new Map<string, number>();
      const dailyMap = new Map<string, DailyReport[]>();
      const childrenById = new Map(childrenData.filter(child => child.id).map(child => [child.id!, child]));
      let attendanceRecords: {id: string; data: any}[] = [];
      const attendanceByChild = new Map<string, Set<string>>();
      const futureLoads = new Map<string, Promise<Record<string, string>>>();
      const loadFuturePlans = (child: Child) => {
        if (!futureLoads.has(child.id!)) {
          futureLoads.set(child.id!, getMonthlyTreeCommunications(child.id!, selectedOfficeId, targetMonth)
            .then(snap => collectOfficeFuturePlans(attendanceRecords, snap.docs.map(d => ({id: d.id, data: d.data()})),
              child, selectedOfficeId, targetMonth, attendanceByChild.get(child.id!) || new Set())));
        }
        return futureLoads.get(child.id!)!;
      };

      try {
        const [plansSnap, dailySnap, legacyAttendance, scopedAttendance] = await Promise.all([
          getDocs(query(collection(db, 'supportPlans'), where('month', '==', targetMonth))),
          getDocs(query(collection(db, 'daily_reports'), where('planMonth', '==', targetMonth))),
          getDocs(query(collection(db, 'reports'), where(documentId(), '>=', `${targetMonth}-01`), where(documentId(), '<=', `${targetMonth}-31`))),
          getDocs(query(collection(db, 'reports'), where(documentId(), '>=', `${selectedOfficeId}_${targetMonth}-01`), where(documentId(), '<=', `${selectedOfficeId}_${targetMonth}-31`))),
        ]);
        attendanceRecords = [...legacyAttendance.docs, ...scopedAttendance.docs].map(d => ({id: d.id, data: d.data()}));
        for (const [id, child] of childrenById) attendanceByChild.set(id, officeAttendanceDates(attendanceRecords, child, selectedOfficeId, targetMonth));

        plansSnap.forEach(d => {
          const data = d.data();
          const child = childrenById.get(data.childId);
          if (!child) return;
          const priority = excelExportOfficePriority(data, d.id, child, selectedOfficeId, targetMonth);
          if (!priority || priority <= (goalPriorities.get(data.childId) || 0)) return;
          goalsMap.set(data.childId, data.goals || '');
          goalPriorities.set(data.childId, priority);
        });

        dailySnap.forEach(d => {
          const dData = d.data();
          const child = childrenById.get(dData.childId);
          const dateKey = supportDateKey(dData.date, targetMonth);
          if (child && dateKey && attendanceByChild.get(child.id!)?.has(dateKey) && excelExportOfficePriority(dData, d.id, child, selectedOfficeId, targetMonth)) {
            if (!dailyMap.has(dData.childId)) {
              dailyMap.set(dData.childId, []);
            }
            dailyMap.get(dData.childId)!.push({
              id: d.id,
              ...dData,
              date: dateKey,
              content: dData.content || {}
            } as DailyReport);
          }
        });

        // 各児童の日報を日付順にソート
        dailyMap.forEach(list => {
          list.sort((a, b) => {
            const numA = parseInt((a.date.match(/(\d+)日/) || ['', '0'])[1], 10);
            const numB = parseInt((b.date.match(/(\d+)日/) || ['', '0'])[1], 10);
            return numA - numB;
          });
        });
      } catch (err) {
        console.error('Batch fetch error for targetMonth:', err);
        throw new Error('対象事業所の記録を取得できませんでした。ファイルは変更していません。もう一度お試しください。');
      }

      // 各ファイルを高速スキャン
      const items: ScannedExcelItem[] = [];

      for (let i = 0; i < excelFiles.length; i++) {
        const fileHandle = excelFiles[i];
        setScanProgress({ current: i + 1, total: excelFiles.length, fileName: fileHandle.name });

        try {
          const file = await fileHandle.getFile();
          const arrayBuffer = await file.arrayBuffer();
          const wb = XLSX.read(arrayBuffer, { type: 'array' });

          const sheetNames = wb.SheetNames;
          const hasTemplate = sheetNames.some(name => {
            const clean = name.replace(/[\s　]+/g, '');
            return clean === '原本' || clean.includes('原本');
          });

          // 児童名の検出
          let detectedName = '';
          const targetWsName = sheetNames.find(s => s.includes('原本')) || sheetNames[0];
          const ws = targetWsName ? wb.Sheets[targetWsName] : null;

          if (ws) {
            // I2 (cell r=1, c=8)
            if (ws['I2']?.v) {
              detectedName = String(ws['I2'].v).trim();
            }
            if (!detectedName) {
              const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
              for (let r = 0; r < Math.min(grid.length, 15); r++) {
                const row = grid[r] || [];
                for (let c = 0; c < row.length; c++) {
                  const val = String(row[c] || '').replace(/[\s　]+/g, '');
                  if (val === '名前' || val === '氏名' || val.includes('児童名')) {
                    for (let offset = 1; offset <= 5; offset++) {
                      const neighbor = String(row[c + offset] || '').trim();
                      if (neighbor && neighbor !== '名前' && neighbor !== '氏名') {
                        detectedName = neighbor;
                        break;
                      }
                    }
                  }
                  if (detectedName) break;
                }
                if (detectedName) break;
              }
            }
          }

          const matched = matchChild(detectedName, file.name);

          // 新規シート名の重複判定
          const cleanNames = new Set(sheetNames.map(s => s.trim()));
          let targetSheet = baseSheetName;
          if (cleanNames.has(targetSheet)) {
            const letters = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
            for (const letter of letters) {
              const candidate = `${baseSheetName}（${letter}）`;
              if (!cleanNames.has(candidate)) {
                targetSheet = candidate;
                break;
              }
            }
          }

          // 目標と日報の割り当て
          let goals = '';
          let dailyRows: DailyReport[] = [];

          if (matched && matched.id) {
            goals = goalsMap.get(matched.id) || '';
            dailyRows = dailyMap.get(matched.id) || [];
            dailyRows = supplementSupportFutureRows(dailyRows, await loadFuturePlans(matched), attendanceByChild.get(matched.id) || new Set(), matched.id, targetMonth);
            existingExcelRows(dailyRows, targetMonth);

            // マップになかった場合の個別フォールバック
            if (!goalsMap.has(matched.id)) {
              try {
                for (const id of [`${selectedOfficeId}_${matched.id}_${targetMonth}`, `${matched.id}_${targetMonth}`]) {
                  const pDoc = await getDoc(doc(db, 'supportPlans', id));
                  if (pDoc.exists() && excelExportOfficePriority(pDoc.data(), id, matched, selectedOfficeId, targetMonth)) {
                    goals = pDoc.data().goals || '';
                    break;
                  }
                }
              } catch (e) { throw new Error('対象事業所の目標を取得できませんでした。'); }
            }
          }

          const hasData = !!(goals.trim() || dailyRows.length > 0);
          let status: ScannedExcelItem['status'] = 'ready';
          if (!matched) status = 'no-child';
          else if (!hasTemplate) status = 'no-template';
          else if (!hasData) status = 'no-data';

          items.push({
            fileHandle,
            fileName: file.name,
            matchedChild: matched,
            hasTemplateSheet: hasTemplate,
            targetSheetName: targetSheet,
            existingSheetNames: sheetNames,
            goals,
            dailyRows,
            hasData,
            status,
            selected: status === 'ready'
          });
        } catch (err: any) {
          console.warn(`File scan error for ${fileHandle.name}:`, err);
          items.push({fileHandle, fileName: fileHandle.name, matchedChild: null, hasTemplateSheet: false,
            targetSheetName: baseSheetName, existingSheetNames: [], goals: '', dailyRows: [], hasData: false,
            status: 'error', errorMessage: err.message || String(err), selected: false});
        }
      }

      setLogs(prev => [...prev, `✔ ${items.length}件のファイルを照合完了しました。事前プレビューを表示します。`]);
      setScannedItems(items);
      setScanContext({...exportContext, directoryHandle: dirHandle});
      setIsScanning(false);
      setIsModalOpen(true);
      setIsFinished(false);
    } catch (err: any) {
      console.warn('Excel folder selection/scan failed:', err);
      setFolderMessage(err.name === 'AbortError' ? 'フォルダの読み取り許可を確認できませんでした。選択の中断や、ブラウザによるアクセス拒否で起こります。選択してもこの表示になる場合は、ChromeまたはEdgeで同じ画面を開いてお試しください。' : `処理できませんでした: ${err.message || err}`);
      setIsScanning(false);
    } finally {
      setIsPicking(false);
    }
  };

  const handleFolderInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) void handleSelectFolder(files);
  };

  // 全選択・全解除
  const handleToggleSelectAll = (select: boolean) => {
    setScannedItems(prev => prev.map(item => {
      if (item.status === 'ready' || item.status === 'no-data') {
        return { ...item, selected: select };
      }
      return item;
    }));
  };

  // 個別チェック切り替え
  const handleToggleItem = (idx: number) => {
    setScannedItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  // 一括上書きの実行
  const handleExecuteBatch = async () => {
    if (isProcessing) return;
    if (!scanContext || scanContext.key !== settingsKey || loadedSettingsKey !== settingsKey) {
      alert('対象の事業所または年月が変わりました。フォルダを選び直してください。');
      return;
    }
    const targets = scannedItems.filter(item => item.selected && item.matchedChild);
    if (targets.length === 0) {
      alert('上書き対象として選択されたファイルがありません。');
      return;
    }

    setIsProcessing(true);
    if (!downloadMode) {
      try {
        // ユーザー操作直後に要求する。データ取得やファイル処理の後では許可を求められない。
        const permission = await scanContext.directoryHandle?.requestPermission({mode: 'readwrite'});
        if (permission !== 'granted') {
          throw new Error('フォルダへの書き込みが許可されませんでした。ファイルは変更していません。ChromeまたはEdgeで開き、書き込みを許可してから再実行してください。');
        }
      } catch (err: any) {
        setLogs([`上書きを開始できませんでした: ${err.message || err}`]);
        setIsProcessing(false);
        return;
      }
    }
    setIsFinished(false);
    setLogs([`🚀 一括上書きを開始します（対象: ${targets.length} 件）...`]);

    let successCount = 0;
    let errorCount = 0;
    const zip = downloadMode ? new JSZip() : null;

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setProgress({ current: i + 1, total: targets.length, currentFileName: item.fileName });

      try {
        setLogs(prev => [...prev, `▶ [${i + 1}/${targets.length}] 「${item.fileName}」(${item.matchedChild?.fullName}様) を処理中...`]);

        const result = await cloneTemplateAndWriteExcelFile(
          zip ? {
            getFile: () => item.fileHandle.getFile(),
            createWritable: async () => ({
              write: async (buffer: Uint8Array) => { zip.file(item.fileName, buffer); },
              close: async () => {}
            })
          } : item.fileHandle,
          item.matchedChild?.fullName || '',
          targetMonth,
          item.goals,
          item.dailyRows,
          scanContext.creator,
          scanContext.createdDateText,
          (msg) => setLogs(prev => [...prev, `   ${msg}`])
        );

        setLogs(prev => [...prev, `✔ 「${item.fileName}」にシート「${result.sheetName}」を作成${zip ? 'しました（ZIPに追加）' : '・上書き保存しました'}`]);
        successCount++;

        setScannedItems(prev => prev.map(si => si.fileName === item.fileName ? { ...si, status: 'success' } : si));
      } catch (err: any) {
        console.error(`Error writing ${item.fileName}:`, err);
        const errMsg = err.message || String(err);
        setLogs(prev => [...prev, `❌ 「${item.fileName}」の書き込みに失敗: ${errMsg}`]);
        errorCount++;
        setScannedItems(prev => prev.map(si => si.fileName === item.fileName ? { ...si, status: 'error', errorMessage: errMsg } : si));
      }
    }

    if (zip && successCount) {
      try {
        const blob = await zip.generateAsync({type: 'blob'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `専門的支援実施計画_${selectedOfficeId}_${targetMonth}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err: any) {
        setLogs(prev => [...prev, `ZIPの保存に失敗しました: ${err.message || err}。再実行してください。`]);
        setIsProcessing(false);
        return;
      }
    }
    setIsProcessing(false);
    setIsFinished(true);
    setLogs(prev => [
      ...prev,
      `🎉 すべての処理が終了しました！（成功: ${successCount} 件 / エラー: ${errorCount} 件）`
    ]);
  };

  const readyCount = useMemo(() => scannedItems.filter(i => i.status === 'ready').length, [scannedItems]);
  const selectedCount = useMemo(() => scannedItems.filter(i => i.selected).length, [scannedItems]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <SettingsFeature title="Excel一括上書き" direction="アプリ → Excel"
        description="児童のExcelファイルが入ったフォルダを選び、対象月のデータをExcelに書き出します。"
        details={['児童名・ふりがなを使って、対象の児童を照合します。', '「原本」シートを複製し、対象月のシートを作成します。', '同じ名前のシートがある場合は別名で作成し、過去のシートは残します。']} />
      <SettingsGroup title="対象と設定">
        <label className={settingsRowClass}><span>対象年月</span><input type="month" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 text-right outline-emerald-600" /></label>
        <div className={settingsRowClass}><span>作成するシート名</span><span className="text-right text-slate-500">{targetMonth.replace('-', '')}</span></div>
        <div className={settingsRowClass}><span>作成者</span><span className="text-right text-slate-500">{monthSettings.creator || '未設定'}</span></div>
        <div className={settingsRowClass}><span>作成日</span><span className="text-right text-slate-500">{monthSettings.createdDateText || '未設定'}</span></div>
      </SettingsGroup>
      <SettingsGroup title="ファイルの選択">
        <input ref={folderInputRef} type="file" multiple {...{webkitdirectory: ''}} className="hidden" onChange={handleFolderInput} aria-label="Excelファイルのフォルダ" />
        <div className="space-y-3 px-4 py-4"><button type="button" onClick={() => void handleSelectFolder()} disabled={isPicking || isScanning || loadedSettingsKey !== settingsKey} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {isScanning ? <><Loader2 size={18} className="animate-spin" /><span>フォルダを確認中… ({scanProgress.current}/{scanProgress.total})</span></> : isPicking ? <><Loader2 size={18} className="animate-spin" /><span>フォルダの選択を待っています…</span></> : <><FolderOpen size={18} /><span>既存Excelへ直接上書き（フォルダを選択）</span></>}
        </button>
          <button type="button" onClick={() => folderInputRef.current?.click()} disabled={isScanning || loadedSettingsKey !== settingsKey} className="text-xs text-slate-600 underline disabled:opacity-50">別ファイルとしてZIP保存する場合はこちら</button>
          {folderMessage && <p role="alert" className="text-xs text-rose-600">{folderMessage}</p>}
        </div>
      </SettingsGroup>

      <OneTimeExcelDateRepair key={selectedOfficeId} officeId={selectedOfficeId} />

      {/* スキャン中のプログレスバー表示 */}
      {isScanning && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-2 animate-pulse">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-indigo-600" />
              エクセルファイルを高速照合中... ({scanProgress.current} / {scanProgress.total} ファイル)
            </span>
            <span>{Math.round((scanProgress.current / Math.max(1, scanProgress.total)) * 100)}%</span>
          </div>
          <div className="w-full bg-indigo-100 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 h-full transition-all duration-200 rounded-full"
              style={{ width: `${(scanProgress.current / Math.max(1, scanProgress.total)) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-indigo-600 truncate font-mono">{scanProgress.fileName}</p>
        </div>
      )}

      {/* 照合ログ（モーダルが開く前） */}
      {logs.length > 0 && !isModalOpen && (
        <div className="bg-slate-900 text-slate-200 font-mono text-[11px] p-4 rounded-xl max-h-36 overflow-y-auto space-y-1 shadow-inner">
          {logs.map((log, i) => (
            <div key={i} className="leading-tight">{log}</div>
          ))}
        </div>
      )}

      {/* 注意事項 */}
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p className="font-bold text-amber-950">実行前のご注意：</p>
          <p>
            エクセルファイルをExcel等のソフトで開いている最中は、Windowsの仕様により上書き保存ができません。
            <strong>必ずエクセルソフトを終了（ファイルをすべて保存して閉じる）してから実行してください。</strong>
          </p>
          <p className="text-amber-800">
            ※念のため、初回実行前に対象フォルダを丸ごとコピーしてバックアップを取っておくことを推奨いたします。
          </p>
        </div>
      </div>

      {/* 照合確認モーダル（createPortal で document.body に直接マウントし、親コンテナの overflow-hidden によるボタン欠落を完全防止） */}
      {isModalOpen && <ViewportModal className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden border border-slate-100">
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shadow-xs">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                    月別エクセル一括上書きの事前照合プレビュー
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-mono font-bold">
                      対象: {targetMonth}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    検出: {scannedItems.length} 件 ｜ 照合成功: <strong className="text-emerald-600">{readyCount} 件</strong> ｜ 選択中: <strong className="text-indigo-600">{selectedCount} 件</strong>
                  </p>
                </div>
              </div>

              {/* ヘッダー右側のアクションボタン */}
              <div className="flex items-center gap-3">
                {!isProcessing && selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleExecuteBatch}
                    className="hidden sm:flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Check size={16} className="stroke-[3]" />
                    <span>{downloadMode ? 'ZIPを作成して保存' : '一括書き込みを開始'} ({selectedCount}件)</span>
                  </button>
                )}
                {!isProcessing && (
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="閉じる"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            </div>

            {/* モーダルボディ（テーブル） */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* 操作ボタン */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    disabled={isProcessing}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                  >
                    すべて選択
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    disabled={isProcessing}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                  >
                    すべて解除
                  </button>
                </div>
              </div>

              {downloadMode && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">更新したExcelをZIPで保存します。元のファイルは変更しません。</p>}
              {/* 上書き仕様インフォバー */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-bold text-indigo-950">📋 書き込み仕様:</span>
                  <span>✔ 日付は年なし（例: 8月12日）</span>
                  <span>✔ 支援目標は出力せず原本維持</span>
                  <span>✔ セルサイズ・罫線・A4印刷設定を完全維持</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] bg-white/80 px-2.5 py-1 rounded-lg border border-indigo-100">
                  <span>作成日: <strong className="text-indigo-900">{monthSettings.createdDateText || '未設定'}</strong></span>
                  <span className="text-indigo-200">|</span>
                  <span>作成者: <strong className="text-indigo-900">{monthSettings.creator || '未設定'}</strong></span>
                </div>
              </div>

              {/* テーブル */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-12 text-center">選択</th>
                      <th className="p-3">ファイル名</th>
                      <th className="p-3 w-36">照合された児童</th>
                      <th className="p-3 w-32">新規作成シート名</th>
                      <th className="p-3 w-28">アプリ内データ</th>
                      <th className="p-3 w-36">状態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scannedItems.map((item, idx) => (
                      <tr 
                        key={idx} 
                        className={`hover:bg-slate-50 transition-colors ${
                          item.status === 'success' ? 'bg-emerald-50/40' : 
                          item.status === 'error' ? 'bg-red-50/40' :
                          !item.selected ? 'opacity-60 bg-slate-50/30' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            disabled={isProcessing || item.status === 'no-child' || item.status === 'no-template'}
                            onChange={() => handleToggleItem(idx)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-medium text-slate-800 break-all">
                          {item.fileName}
                        </td>
                        <td className="p-3">
                          {item.matchedChild ? (
                            <span className="font-bold text-slate-800 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              {item.matchedChild.fullName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                              <X size={12} /> 未照合
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-indigo-700">
                          {item.targetSheetName}
                        </td>
                        <td className="p-3">
                          <div className="space-y-0.5 text-[11px]">
                            <span className={item.goals ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                              目標: {item.goals ? 'あり' : 'なし'}
                            </span>
                            <br />
                            <span className={item.dailyRows.length > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                              日報: {item.dailyRows.length}件
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          {item.status === 'success' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 size={12} /> 書き込み完了
                            </span>
                          ) : item.status === 'error' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300" title={item.errorMessage}>
                              <AlertCircle size={12} /> エラー
                            </span>
                          ) : item.status === 'ready' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              準備完了
                            </span>
                          ) : item.status === 'no-data' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              アプリ内データなし
                            </span>
                          ) : item.status === 'no-template' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                              原本シートなし
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                              児童未特定
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 進行状況 & リアルタイムログ */}
              {(isProcessing || logs.length > 0) && (
                <div className="space-y-2 pt-2">
                  {isProcessing && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span>進捗: {progress.current} / {progress.total} ファイル</span>
                        <span>{Math.round((progress.current / (progress.total || 1)) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                          style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-900 text-slate-200 font-mono text-[11px] p-4 rounded-xl max-h-36 overflow-y-auto space-y-1">
                    {logs.map((log, i) => (
                      <div key={i} className="leading-tight">{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* モーダルフッター（固定表示） */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 shadow-xs">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isFinished ? '閉じる' : 'キャンセル'}
              </button>

              <button
                type="button"
                onClick={handleExecuteBatch}
                disabled={isProcessing || selectedCount === 0}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-lg shadow-emerald-600/25 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>エクセル上書き処理中... ({progress.current}/{progress.total})</span>
                  </>
                ) : (
                  <>
                    <Check size={18} className="stroke-[3]" />
                    <span>{downloadMode ? `選択した ${selectedCount} 件をZIPで保存` : `選択した ${selectedCount} 件のエクセルに一括書き込みを実行`}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </ViewportModal>}
    </div>
  );
};
