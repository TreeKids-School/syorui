import {createPortal} from 'react-dom';
import {measureReads} from '../lib/readDiagnostics';
import {appendDocumentAudit} from '../lib/documentAudit';
import {DocumentTransferModal} from '../components/DocumentTransferModal';
import {BatchExcelImport} from '../components/BatchExcelImport';
import {ImplementationAuthorSettings} from '../components/ImplementationAuthorSettings';
import {supportGoalText} from '../lib/supportGoalText';
import {ChildSwitcher} from '../components/ChildSwitcher';
import {supportGoalPlan, supportGoalPlanMonth} from '../lib/supportGoalPlan';
import {DocumentTypeSelect} from '../components/DocumentTypeSelect';
import {MonthPicker} from '../components/ui/MonthPicker';
import {ViewportModal} from '../components/ViewportModal';
import {SupportChangeHistory} from '../components/SupportChangeHistory';
import {describeSupportChanges} from '../lib/supportChangeHistory';
import type {SupportSnapshot} from '../lib/supportChangeHistory';
import {StaffAccountContext} from '../components/StaffAccountBadge';
import {createLatestSaveQueue, mergeSavedSupportIds, supportDraftSignature, supportRowDeletions} from '../lib/supportSaveQueue';
import {SupportImplementationPrintSettings} from '../components/SupportImplementationPrintSettings';
import {prepareSupportPrintRows} from '../lib/supportImplementationPrint';
import { getMonthlySettings } from '../lib/monthlySettings';
import {matchesOffice} from '../lib/officeUtils';
import {excelExportOfficePriority} from '../lib/excelExportOfficeScope';
import {isEmptyNewSupportRecord, needsNewsletterReview} from '../lib/supportRecordReview';
import {officeAttendanceDates, filterOfficeAttendanceRows, supportDateKey} from '../lib/supportOfficeAttendance';
import {collectOfficeFuturePlans, resolveSupportFuturePlan} from '../lib/supportFuturePlans';
import {getMonthlyTreeCommunications,invalidateMonthlyTreeCommunications} from '../lib/monthlyTreeCommunications';
import {describeReadError} from '../lib/readError';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Archive, RefreshCw,
  Target,
  Loader2,
  X, Check, Copy, AlertTriangle,
  Undo2, Redo2
} from 'lucide-react';
import { SupportImplementationRow } from './SupportImplementationRow';
import { ResultImportModal } from '../components/ResultImportModal';
import { parseGoalsText } from '../lib/utils';
import { performUndo, performRedo, type ImportHistoryAction } from '../lib/importHistory';
import {
  doc, getDoc as firestoregetDoc, getDocs as firestoregetDocs, writeBatch,
  collection, query, where, documentId,
  serverTimestamp
} from 'firebase/firestore';
const getDocs=measureReads('専門的支援実施計画',firestoregetDocs);
const getDoc=measureReads('専門的支援実施計画',firestoregetDoc);

import { db, auth } from '../lib/firebase';
import { convertToResult, GeminiApiError } from '../lib/aiConvert';
import type { Child } from '../data/mockData';
import type { DailyReport, SupportPlanMeta } from '../types/supportPlan';
import type { ProfessionalPlanDoc } from '../types/professionalPlan';
import { overwriteExistingExcelFile } from '../lib/excelExport';
import {SupportImplementationToolbar} from '../components/SupportImplementationToolbar';

const PLAN_COL = 'supportPlans';
const PROF_PLAN_COL = 'professionalPlans';
const DAILY_COL = 'daily_reports';




type SupportImplementationProps = {
  childrenData: Child[];
  selectedOfficeId: string;
  offices: { id: string; name: string }[];
};

export const SupportImplementation: React.FC<SupportImplementationProps> = ({ childrenData, selectedOfficeId, offices }) => {
  const currentOffice = offices.find(o => o.id === selectedOfficeId);
  const officeName = currentOffice ? currentOffice.name : 'Search';
  const { childId, month: urlMonth } = useParams<{ childId: string; month?: string }>();
  const navigate = useNavigate();

  // 1) 月がURLにない場合はリダイレクト
  useEffect(() => {
    if (childId && !urlMonth) {
      const m = new Date().toISOString().slice(0, 7);
      navigate(`/children/${childId}/support-plan/${m}`, { replace: true });
    }
  }, [childId, urlMonth, navigate]);

  const currentMonth = urlMonth || new Date().toISOString().slice(0, 7);

  const [planMeta, setPlanMeta] = useState<SupportPlanMeta | null>(null);
  const [rows, setRowsState] = useState<DailyReport[]>([]);
  const nextLocalRowKey = React.useRef(0);
  const setRows = useCallback((update: React.SetStateAction<DailyReport[]>) => {
    setRowsState(previous => {
      const next = typeof update === 'function' ? update(previous) : update;
      return next.some(row => !row.localKey) ? next.map(row => row.localKey ? row : {...row, localKey: row.id || `draft-${++nextLocalRowKey.current}`}) : next;
    });
  }, []);
  const saveQueue = React.useRef(createLatestSaveQueue());
  const assignedSaveIds = React.useRef(new Map<string, string>());
  const lastSavedDraft = React.useRef('');
  const saveGeneration = React.useRef(0);
  const [officeAttendanceDateKeys, setOfficeAttendanceDateKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [mobileHeaderSlot,setMobileHeaderSlot]=useState<HTMLElement|null>(null);
  useEffect(()=>{setMobileHeaderSlot(document.getElementById('mobile-summary-header-slot'));},[]);
  const [newsletters, setNewsletters] = useState<Record<string, string>>({});
  const [futurePlans, setFuturePlans] = useState<Record<string, string>>({});
  const [isConverting, setIsConverting] = useState(false);
  // 日付編集中の行インデックス (null = 全行ロック)
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null);
  const isNewsletterCollapsed = false;
  const [monthlySettings, setMonthlySettings] = useState<any>(null);
  const [availableProfPlans, setAvailableProfPlans] = useState<ProfessionalPlanDoc[]>([]);
  const [loginStaffName, setLoginStaffName] = useState<string>("");
  const [loginOfficeId, setLoginOfficeId] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const isInitialLoad = React.useRef(true);
  const fetchSequence = React.useRef(0);
  const pendingReadScope = React.useRef('');
  const loadedScope = React.useRef('');
  const activeScope = React.useRef('');
  activeScope.current = `${selectedOfficeId}_${childId}_${currentMonth}`;
  const latestDraft = React.useRef({scope: activeScope.current, signature: ''});
  latestDraft.current = {scope: activeScope.current, signature: supportDraftSignature(planMeta, rows)};
  useEffect(() => {
    const scope = `${selectedOfficeId}_${childId}_${currentMonth}`;
    activeScope.current = scope;
    return () => { if (activeScope.current === scope) activeScope.current = ''; };
  }, [selectedOfficeId, childId, currentMonth]);
  const account = React.useContext(StaffAccountContext);
  const auditBaseline = React.useRef<{scope:string; snapshot:SupportSnapshot} | null>(null);
  const pendingRowDeletions = React.useRef(new Map<string, Map<string, DailyReport>>());
  const [deleteTarget, setDeleteTarget] = useState<{scope:string;row:DailyReport}|null>(null);
  const [transferDirection,setTransferDirection]=useState<'export'|'import'|null>(null);
  const [excelImportOpen,setExcelImportOpen]=useState(false);
  const [isAuthorSettingsOpen,setIsAuthorSettingsOpen]=useState(false);
  const [isChangeHistoryOpen, setIsChangeHistoryOpen] = useState(false);
  const [isPrintSettingsOpen, setIsPrintSettingsOpen] = useState(false);
  const [isResultImportOpen, setIsResultImportOpen] = useState(false);
  const [, setExportLogs] = useState<string[]>([]);
  const [isExportSuccessOpen, setIsExportSuccessOpen] = useState(false);
  const [exportSuccessType, setExportSuccessType] = useState<'direct' | 'download'>('direct');
  const [targetFileName, setTargetFileName] = useState('');
  const [exportSheetName, setExportSheetName] = useState('');

  // アンドゥ・リドゥ（Undo / Redo）履歴管理
  const [undoStack, setUndoStack] = useState<ImportHistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<ImportHistoryAction[]>([]);
  const [isUndoRedoing, setIsUndoRedoing] = useState(false);
  const [recentlyImportedDates, setRecentlyImportedDates] = useState<Set<string>>(new Set());
  const [historyToast, setHistoryToast] = useState<{
    message: string;
    actionId?: string;
    type: 'success' | 'undo' | 'redo';
    canUndo?: boolean;
    canRedo?: boolean;
  } | null>(null);

  const selectedChild = childId ? childrenData.find(c => c.id === childId) : null;

  const [rawError, setRawError] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<{
    message: string;
    url: string;
    model: string;
    payload: any;
    availableModels: string[];
    listModelsError?: string;
    httpStatus?: number;
    httpResponse?: string;
    retryAfter?: string;
    requestCount?: string;
    errorDetails?: any;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyDebugInfo = () => {
    if (!debugError) return;
    const text = `【Gemini API 変換エラー詳細】
エラー内容: ${debugError.message}
HTTPステータス: ${debugError.httpStatus ?? 'N/A'}
Retry-After (推奨待機秒数): ${debugError.retryAfter ?? '検出なし'}
送信回数: ${debugError.requestCount ?? 'N/A'}
送信URL: ${debugError.url}
送信モデル: ${debugError.model}
利用可能モデル一覧 (ListModels結果):
${JSON.stringify(debugError.availableModels, null, 2)}
ListModels実行時エラー: ${debugError.listModelsError ?? 'なし'}
リクエスト内容 (JSON):
${debugError.payload ? JSON.stringify(debugError.payload, null, 2) : 'N/A'}
レスポンス内容 (HTTP Response):
${debugError.httpResponse ?? 'N/A'}
APIエラー詳細 (JSON):
${debugError.errorDetails ? JSON.stringify(debugError.errorDetails, null, 2) : 'なし'}`;

    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // ---- データ取得 ----
  const fetchData = useCallback(async () => {
    if (!childId || childrenData.length === 0) return;
    const scope = `${selectedOfficeId}_${childId}_${currentMonth}`;
    if (pendingReadScope.current === scope) return;
    pendingReadScope.current = scope;
    const sequence = ++fetchSequence.current;
    const isCurrent = () => sequence === fetchSequence.current && activeScope.current === scope;
    loadedScope.current = '';
    isInitialLoad.current = true;
    setRows([]);
    setPlanMeta(null);
    console.time(`fetchData-${childId}`);
    setIsLoading(true);
    setRawError(null);

    try {
      const docId = selectedOfficeId ? `${selectedOfficeId}_${childId}_${currentMonth}` : `${childId}_${currentMonth}`;
      
      // 1) ログインスタッフ情報と事業所IDの取得
      let officeId = selectedOfficeId;
      let sName = "";
      if (auth.currentUser) {
        const staffSnap = await getDoc(doc(db, 'staff', auth.currentUser.uid));
        if (staffSnap.exists()) {
          const staffData = staffSnap.data();
          sName = staffData.name || staffData.fullName || "";
        }
      }
      if (!isCurrent()) return;
      setLoginOfficeId(officeId);
      setLoginStaffName(sName);

      // 2) 各種データを並列取得
      const startPath = `${currentMonth}-01`;
      const endPath = `${currentMonth}-31`;
      
      const queries: Promise<any>[] = [
        getDoc(doc(db, PLAN_COL, docId)),
        getDocs(query(
          collection(db, PROF_PLAN_COL),
          where('childId', '==', childId),
          where('officeId', '==', selectedOfficeId),
          where('status', '==', 'final')
        )),
        getDocs(query(
          collection(db, DAILY_COL), 
          where('childId', '==', childId), 
          where('planMonth', '==', currentMonth),
          where('officeId', '==', selectedOfficeId)
        )),
        getMonthlySettings(selectedOfficeId, currentMonth),
        // reports (プレフィックスなし)
        getDocs(query(
          collection(db, 'reports'), 
          where(documentId(), '>=', startPath), 
          where(documentId(), '<=', endPath)
        ))
      ];

      // reports (プレフィックスあり)
      if (officeId) {
        const startPathPrefixed = `${officeId}_${currentMonth}-01`;
        const endPathPrefixed = `${officeId}_${currentMonth}-31`;
        queries.push(
          getDocs(query(
            collection(db, 'reports'), 
            where(documentId(), '>=', startPathPrefixed), 
            where(documentId(), '<=', endPathPrefixed)
          ))
        );
      }

      // children/{childId}/app_categories/書類管理/tree_communications の取得
      queries.push(
        getMonthlyTreeCommunications(childId, selectedOfficeId, currentMonth)
      );

      const results = await Promise.all(queries);
      if (!isCurrent()) return;
      
      const metaSnap = results[0] as any;
      const profDocs = results[1] as any;
      const dailySnap = results[2] as any;
      const settingsSnap = results[3] as any;
      const reportSnap1 = results[4] as any;
      const reportSnap2 = officeId ? results[5] as any : null;
      const treeCommSnap = results[results.length - 1] as any;
      const attendanceDates = selectedChild ? officeAttendanceDates(
        [...reportSnap1.docs, ...(reportSnap2?.docs || [])].map((d: any) => ({id: d.id, data: d.data()})),
        selectedChild, selectedOfficeId, currentMonth,
      ) : new Set<string>();
      setOfficeAttendanceDateKeys(attendanceDates);

      // 計画メタ情報
      let meta: SupportPlanMeta;
      if (metaSnap.exists() && selectedChild && excelExportOfficePriority(metaSnap.data(), docId, selectedChild, selectedOfficeId, currentMonth)) {
        meta = metaSnap.data() as SupportPlanMeta;
      } else {
        // フォールバック: プレフィックスなしドキュメントの取得を試行
        const fallbackDocId = `${childId}_${currentMonth}`;
        const fallbackSnap = await getDoc(doc(db, PLAN_COL, fallbackDocId));
        if (!isCurrent()) return;
        if (fallbackSnap.exists() && selectedChild && excelExportOfficePriority(fallbackSnap.data(), fallbackDocId, selectedChild, selectedOfficeId, currentMonth)) {
          meta = fallbackSnap.data() as SupportPlanMeta;
        } else {
          meta = { 
            childId, month: currentMonth, goals: "", 
            author: "スタッフ 太郎", createdAt: new Date().toISOString() 
          };
        }
      }
      setPlanMeta(meta);

      // プロフェッショナルプラン一覧を保存
      let list: ProfessionalPlanDoc[] = [];
      if (profDocs && !profDocs.empty) {
        list = profDocs.docs.map((d: any) => ({ ...d.data(), id: d.id } as ProfessionalPlanDoc));
      }
      setAvailableProfPlans(list);

      // 月別設定
      if (settingsSnap.exists()) {
        setMonthlySettings(settingsSnap.data());
      } else {
        setMonthlySettings(null);
      }

      // ツリー通信 (reports) と 今後の予定 のパース
      const newsMap: Record<string, string> = {};
      const futurePlanMap: Record<string, string> = {};
      const futurePlanUpdatedAtMap: Record<string, string> = {};
      const newsUpdatedAtMap: Record<string, string> = {};
      const [yearStr, monthStr] = meta.month.split('-');
      const currentMonthInt = parseInt(monthStr, 10);
      const currentYearInt = parseInt(yearStr, 10);


      const processReportSnap = (snap: any) => {
        if (!snap) return;
        snap.forEach((d: any) => {
          const data = d.data();
          const childResult = data.results?.[childId];
          if (childResult) {
            if (!selectedChild || !excelExportOfficePriority(data, d.id, selectedChild, selectedOfficeId, currentMonth)
              || ((childResult.officeId || childResult.office) && !excelExportOfficePriority(childResult, d.id, selectedChild, selectedOfficeId, currentMonth))) return;
            const parts = d.id.split('_');
            let docOfficeId: string | null = null;
            let dateStr = d.id;
            if (parts.length === 2) {
              docOfficeId = parts[0];
              dateStr = parts[1];
            }

            // 1. 異なる事業所のレポートデータはスキップ
            if (docOfficeId && !matchesOffice(selectedOfficeId, docOfficeId)) {
              return;
            }

            // 2. 複数事業所に所属する場合、事業所プレフィックスがないドキュメントは混同回避のためスキップ

            const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (match) {
              const yNum = parseInt(match[1], 10);
              const mNum = parseInt(match[2], 10);
              const dNum = parseInt(match[3], 10);

              if (yNum === currentYearInt && mNum === currentMonthInt) {
                const dateKey = `${mNum}月${dNum}日`;
                const updatedAtStr = data.updatedAt || data.createdAt || "";

                if (childResult.D) {
                  const existingText = newsMap[dateKey];
                  const existingUpdate = newsUpdatedAtMap[dateKey] || "";
                  if (!existingText || !existingUpdate || updatedAtStr >= existingUpdate) {
                    newsMap[dateKey] = childResult.D;
                    newsUpdatedAtMap[dateKey] = updatedAtStr;
                  }
                }

                // reports の results[childId].futurePlan / future_plan
                const repFuture = childResult.futurePlan || childResult.future_plan;
                if (repFuture) {
                  const existingPlan = futurePlanMap[dateKey];
                  const existingUpdate = futurePlanUpdatedAtMap[dateKey] || "";
                  if (!existingPlan || !existingUpdate || updatedAtStr >= existingUpdate) {
                    futurePlanMap[dateKey] = repFuture;
                    futurePlanUpdatedAtMap[dateKey] = updatedAtStr;
                  }
                }
              }
            }
          }
        });
      };
      processReportSnap(reportSnap1);
      processReportSnap(reportSnap2);

      if (treeCommSnap && !treeCommSnap.empty) {
        treeCommSnap.forEach((d: any) => {
          const data = d.data();
          if (!selectedChild || !excelExportOfficePriority(data, d.id, selectedChild, selectedOfficeId, currentMonth)) return;
          
          const parts = d.id.split('_');
          let docOfficeId: string | null = null;
          let dateStr = d.id;
          if (parts.length === 2) {
            docOfficeId = parts[0];
            dateStr = parts[1];
          }

          // 1. 他の事業所のIDプレフィックスならスキップ
          if (docOfficeId && !matchesOffice(selectedOfficeId, docOfficeId)) {
            return;
          }
          // データ内のofficeId / officeフィールドでのフィルタ

          // 2. 複数所属の児童で、事業所情報が一切無いデータは混同回避のためスキップ

          const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (match) {
            const yearNum = parseInt(match[1], 10);
            const mNum = parseInt(match[2], 10);
            const dNum = parseInt(match[3], 10);
            
            // クエリが全件取得になったため、JS側で対象年月の日報のみフィルタリング
            if (yearNum === currentYearInt && mNum === currentMonthInt) {
              const key = `${mNum}月${dNum}日`;
              const updatedAtStr = data.updatedAt || data.createdAt || "";

              const tcFuture = data.future_plan || data.futurePlan;
              if (tcFuture) {
                const existingPlan = futurePlanMap[key];
                const existingUpdate = futurePlanUpdatedAtMap[key] || "";
                if (!existingPlan || !existingUpdate || updatedAtStr > existingUpdate) {
                  futurePlanMap[key] = tcFuture;
                  futurePlanUpdatedAtMap[key] = updatedAtStr;
                }
              }
              const tcText = data.tree_comm_text || (data.results?.[childId]?.D);
              if (tcText) {
                const existingText = newsMap[key];
                const existingUpdate = newsUpdatedAtMap[key] || "";
                if (!existingText || !existingUpdate || updatedAtStr > existingUpdate) {
                  newsMap[key] = tcText;
                  newsUpdatedAtMap[key] = updatedAtStr;
                }
              }
            }
          }
        });
      }
      const canonicalFutures = selectedChild ? collectOfficeFuturePlans(
        [...reportSnap1.docs, ...(reportSnap2?.docs || [])].map((d: any) => ({id: d.id, data: d.data()})),
        treeCommSnap.docs.map((d: any) => ({id: d.id, data: d.data()})), selectedChild, selectedOfficeId, currentMonth, attendanceDates,
      ) : {};
      for (const date of Object.keys(futurePlanMap)) delete futurePlanMap[date];
      Object.assign(futurePlanMap, canonicalFutures);
      setNewsletters(newsMap);
      setFuturePlans(futurePlanMap);
      for (const date of Object.keys(newsMap)) if (!attendanceDates.has(date)) delete newsMap[date];
      for (const date of Object.keys(futurePlanMap)) if (!attendanceDates.has(date)) delete futurePlanMap[date];

      // daily_reports の処理
      const savedRowsGrouped: Record<string, any[]> = {};
      dailySnap.docs.forEach((d: any) => {
        const data = d.data();
        if (!selectedChild || !excelExportOfficePriority(data, d.id, selectedChild, selectedOfficeId, currentMonth)) return;
        let dateStr = "";
        let dObj: Date | null = null;

        // 日付の解析 (Timestamp または 文字列)
        if (data.date && typeof data.date.toDate === 'function') {
          const dateObj = data.date.toDate();
          dObj = dateObj;
          dateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
        } else if (typeof data.date === 'string') {
          const parts = data.date.split('-');
          if (parts.length === 3) {
            const mNum = parseInt(parts[1], 10);
            const dNum = parseInt(parts[2], 10);
            dateStr = `${mNum}月${dNum}日`;
            dObj = new Date(parseInt(parts[0], 10), mNum - 1, dNum);
          } else {
            const parsed = new Date(data.date);
            if (!isNaN(parsed.getTime())) {
              dObj = parsed;
              dateStr = `${dObj.getMonth() + 1}月${dObj.getDate()}日`;
            } else {
              dateStr = data.date;
            }
          }
        }

        if (dateStr) {
          const [targetYear, targetMonth] = meta.month.split('-');
          if (dObj) {
            if (dObj.getFullYear() !== parseInt(targetYear, 10) || (dObj.getMonth() + 1) !== parseInt(targetMonth, 10)) {
              return; // 対象月以外はスキップ
            }
          }

          const externalInfo = data.content?.externalInfo || data.externalInfo || "";
          const supportContent = data.content?.supportContent || [];
          const resultInfo = data.content?.resultInfo || "";
          const futurePlan = data.content?.futurePlan || "";
          const isVerified = data.content?.isVerified || false;
          const staffId = data.staffId || data.staffName || "";

          if (!savedRowsGrouped[dateStr]) savedRowsGrouped[dateStr] = [];
          savedRowsGrouped[dateStr].push({
            id: d.id,
            ...data,
            date: dateStr,
            staffId,
            content: { externalInfo, supportContent, resultInfo, futurePlan, isVerified }
          });
        }
      });

      // 統合（ツリー通信の日付 or 今後の予定の日付 or 保存済みの日付）
      const allDates = Array.from(new Set([
        ...Object.keys(newsMap), 
        ...Object.keys(futurePlanMap), 
        ...Object.keys(savedRowsGrouped)
      ]));
      const monthNum = parseInt(meta.month.split('-')[1] || '0', 10);
      const excludedDatesSet = new Set(meta.excludedDates || []);

      const targetDates = allDates.filter(d => {
        if (!attendanceDates.has(d)) return false;
        if (excludedDatesSet.has(d)) return false;
        const m = d.match(/^(\d+)月/);
        return m && (monthNum === 0 || parseInt(m[1]) === monthNum);
      }).sort((a, b) => {
        const parse = (s: string) => {
          const m = s.match(/(\d+)月(\d+)日/);
          return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
        };
        return parse(a) - parse(b);
      });

      const finalRows: DailyReport[] = [];
      targetDates.forEach(date => {
        const savedList = savedRowsGrouped[date] || [];
        
        if (savedList.length > 0) {
          savedList.forEach(saved => {
            // 古い保存済み本文は他事業所から複製された可能性があるため再利用しない。
            const externalInfo = newsMap[date] || "";
            const futurePlan = resolveSupportFuturePlan(saved.content.futurePlan, futurePlanMap[date]);
            finalRows.push({
              id: saved.id,
              childId,
              planMonth: meta.month,
              date: date,
              staffId: saved.staffId || "",
              type: 'tree_report',
              content: {
                externalInfo,
                supportContent: saved.content.supportContent || [],
                resultInfo: saved.content.resultInfo || "",
                futurePlan,
                isVerified: saved.content.isVerified || false,
              },
              archived: saved.archived || false,
              createdAt: saved.createdAt || new Date().toISOString(),
              updatedAt: saved.updatedAt || new Date().toISOString(),
            });
          });
        } else {
          // 保存データはないがツリー通信がある場合（バーチャル行）
          finalRows.push({
            childId,
            planMonth: meta.month,
            date: date,
            staffId: "",
            type: 'tree_report',
            content: {
              externalInfo: newsMap[date] || "",
              supportContent: [],
              resultInfo: "",
              futurePlan: futurePlanMap[date] || "",
              isVerified: false,
            },
            archived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });

      const active = finalRows.filter(r => !r.archived);
      const archived = finalRows.filter(r => r.archived);
      loadedScope.current = scope;
      const loadedRows = [...active, ...archived].map(row => row.localKey ? row : {...row, localKey: row.id || `draft-${++nextLocalRowKey.current}`});
      auditBaseline.current = {scope, snapshot:{meta, rows:loadedRows}};
      lastSavedDraft.current = `${scope}:${supportDraftSignature(meta, loadedRows)}`;
      setRows(loadedRows);

      // ボタンでの個別同期用に newsletters state に登録
      setNewsletters(newsMap);
      setFuturePlans(futurePlanMap);

    } catch (e: any) {
      if (!isCurrent()) return;
      console.error('fetchData error:', e);
      setRawError(describeReadError(e));
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        isInitialLoad.current = true; // 初回無視フラグ
        pendingReadScope.current = '';
      }
      console.timeEnd(`fetchData-${childId}`);
    }
  }, [childId, currentMonth, childrenData.length, selectedOfficeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derive immediately when the month changes; do not retain the previous month's source.
  const profPlan = supportGoalPlan(availableProfPlans, childId || '', currentMonth);

  // ---- 保存 ----
  const persistDraft = useCallback(async () => {
    if (!planMeta || !childId || !selectedOfficeId || loadedScope.current !== `${selectedOfficeId}_${childId}_${currentMonth}`) return;
    if (planMeta.childId !== childId || planMeta.month !== currentMonth || rows.some(row => row.childId !== childId || row.planMonth !== currentMonth)) return;
    const scope = `${selectedOfficeId}_${childId}_${currentMonth}`;
    const signature = supportDraftSignature(planMeta, rows);
    if (activeScope.current !== scope || lastSavedDraft.current === `${scope}:${signature}`) return;
    const generation = ++saveGeneration.current;
    setSaveStatus('saving');
    try {
      const docId = selectedOfficeId ? `${selectedOfficeId}_${childId}_${currentMonth}` : `${childId}_${currentMonth}`;
      const batch = writeBatch(db);
      batch.set(doc(db, PLAN_COL, docId), {
        ...planMeta,
        officeId: selectedOfficeId,
      }, { merge: true });

      const updatedRows = [...rows];

      for (let i = 0; i < updatedRows.length; i++) {
        const row = updatedRows[i];
        if (isEmptyNewSupportRecord(row)) continue;
        if (!officeAttendanceDateKeys.has(supportDateKey(row.date, currentMonth) || '')) continue;
        const [yearStr] = planMeta.month.split('-');
        const mMatch = row.date.match(/(\d+)月/);
        const dMatch = row.date.match(/(\d+)日/);
        const monthNum = mMatch ? parseInt(mMatch[1]) : 1;
        const dayNum = dMatch ? parseInt(dMatch[1]) : 1;

        const pad = (n: number) => n.toString().padStart(2, '0');
        const formattedDate = `${yearStr}-${pad(monthNum)}-${pad(dayNum)}`;

        // A) daily_reports (個別報告書) の保存
        const payload: any = {
          childId: row.childId,
          planMonth: row.planMonth,
          date: formattedDate, // 文字列形式で保存してパースエラー解消
          staffId: row.staffId,
          staffName: loginStaffName || row.staffId || "", // 直下に staffName も保存
          type: row.type,
          content: row.content,
          externalInfo: row.content.externalInfo || "", // 直下に externalInfo も保存
          archived: row.archived,
          officeId: selectedOfficeId,
          updatedAt: serverTimestamp(),
        };

        if (!row.id) {
          const key = `${scope}:${row.localKey}`;
          let id = assignedSaveIds.current.get(key);
          if (!id) { id = doc(collection(db, DAILY_COL)).id; assignedSaveIds.current.set(key, id); }
          const newDocRef = doc(db, DAILY_COL, id);
          payload.createdAt = serverTimestamp();
          batch.set(newDocRef, payload);
          updatedRows[i] = { ...row, id: newDocRef.id };
        } else {
          const existingDocRef = doc(db, DAILY_COL, row.id);
          batch.update(existingDocRef, payload);
        }

        // B) 選択中の事業所の日次一括レポートへ保存
        const reportDoc = {
          results: {
            [childId]: {
              D: row.content.externalInfo || ""
            }
          },
          updatedAt: new Date().toISOString()
        };

        if (selectedOfficeId) {
          const reportRefPref = doc(db, 'reports', `${selectedOfficeId}_${formattedDate}`);
          batch.set(reportRefPref, reportDoc, { merge: true });
        }

        // C) 選択中事業所のツリー通信へ保存
        const childTreeDoc = {
          name: selectedChild?.fullName || "",
          tree_comm_text: row.content.externalInfo || "",
          future_plan: row.content.futurePlan || "",
          pickupLocation: "",
          endTime: "",
          transportTime: "",
          notes: "",
          officeId: selectedOfficeId,
          office: selectedOfficeId === 'LNrWc8f6G703aUYRZ5e2' ? 'サーチ' : selectedOfficeId === 'nWioUcWXUskreYjmSL8p' ? 'ホーム' : '',
          updatedAt: new Date().toISOString()
        };
        const childTreeRefPref = doc(db, `children/${childId}/app_categories/書類管理/tree_communications`, `${selectedOfficeId}_${formattedDate}`);
        batch.set(childTreeRefPref, childTreeDoc, { merge: true });
      }

      const deletions = supportRowDeletions(scope, updatedRows, pendingRowDeletions.current.get(scope), assignedSaveIds.current);
      for (const {id} of deletions) {
        if (id) batch.delete(doc(db, DAILY_COL, id));
      }
      const persistedRows = updatedRows.filter(row => row.id && officeAttendanceDateKeys.has(supportDateKey(row.date,currentMonth)||''));
      const before = auditBaseline.current?.scope === scope ? auditBaseline.current.snapshot : {meta:null,rows:[]};
      const changes = describeSupportChanges(before, {meta:planMeta,rows:persistedRows});
      changes.push(...deletions.map(({row})=>({date:String(row.date),field:'療育記録',action:'削除' as const})));
      if(changes.length) {
        const historyRef = doc(collection(db,'offices',selectedOfficeId,'support_change_history',`${childId}_${currentMonth}`,'entries'));
        appendDocumentAudit(batch,{officeId:selectedOfficeId,book:'implementation',childId,month:currentMonth,documentId:docId},changes);
        batch.set(historyRef,{actorUid:auth.currentUser?.uid||'',actorName:account.name||loginStaffName||auth.currentUser?.displayName||'名称未登録',actorColor:account.color,createdAt:serverTimestamp(),changes});
      }
      await batch.commit();
      invalidateMonthlyTreeCommunications(selectedOfficeId,currentMonth,childId);
      for (const {key} of deletions) pendingRowDeletions.current.get(scope)?.delete(key);

      if (activeScope.current !== scope) return;
      const savedIds = new Map(updatedRows.filter(row => row.localKey && row.id).map(row => [row.localKey!, row.id!]));
      setRows(current => mergeSavedSupportIds(current, savedIds));
      auditBaseline.current = {scope,snapshot:{meta:planMeta,rows:updatedRows}};
      lastSavedDraft.current = `${scope}:${signature}`;
      const upToDate = latestDraft.current.scope === scope && latestDraft.current.signature === signature;
      setSaveStatus(upToDate ? 'saved' : 'idle');
      setTimeout(() => {
        if (activeScope.current === scope && saveGeneration.current === generation) setSaveStatus(prev => prev === 'saved' ? 'idle' : prev);
      }, 2000);
    } catch (e) {
      console.error("Save error:", e);
      if (activeScope.current !== scope) return;
      setSaveStatus('error');
    }
  }, [childId, currentMonth, planMeta, rows, loginStaffName, loginOfficeId, selectedChild, selectedOfficeId, officeAttendanceDateKeys, account]);

  const handleSave = useCallback(() => saveQueue.current.run(persistDraft), [persistDraft]);

  // ---- 自動保存デバウンス監視 ----
  useEffect(() => {
    if (isLoading || isConverting) return; // AI変換中は自動保存をトリガーしない

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    if (!planMeta || lastSavedDraft.current === `${activeScope.current}:${supportDraftSignature(planMeta, rows)}`) return;
    const timer = setTimeout(() => {
      void handleSave();
    }, 2000); // 2秒デバウンス

    return () => clearTimeout(timer);
  }, [rows, planMeta, isLoading, isConverting, handleSave]);



  const handleSyncFromNewsletter = (rowIdx: number, rowDate: string) => {
    if (!rowDate) {
      alert('日付を入力してください（例: 4月1日）');
      return;
    }
    const content = newsletters[rowDate];
    const plan = futurePlans[rowDate];
    if (content || plan) {
      if (content) {
        updateRowContent(rowIdx, 'externalInfo', content);
      }
      if (plan) {
        updateRowContent(rowIdx, 'futurePlan', plan);
      }
    } else {
      alert(`「${rowDate}」のツリー通信および今後の予定が見つかりませんでした。`);
    }
  };

  // ---- 全行の日付をツリー通信のキー（日付文字列）で同期 ----
  const syncAllDates = () => {
    const newsletterDates = Object.keys(newsletters).sort((a, b) => {
      const parse = (s: string) => {
        const m = s.match(/(\d+)月(\d+)日/);
        return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
      };
      return parse(a) - parse(b);
    });
    if (newsletterDates.length === 0) {
      alert('ツリー通信のデータが見つかりません。先にデータを取得してください。');
      return;
    }
    setRows(prev =>
      prev.map((row, i) => ({
        ...row,
        date: newsletterDates[i] ?? row.date,
      }))
    );
    setEditingDateIdx(null);
  };

  // ---- 選択した（または全ての）ツリー通信を日付別でコピー ----
  const getTreeCommunicationsText = () => {
    const [year, month] = currentMonth.split('-');
    const byDate = new Map<string, {date:string; text:string}>();
    for (const [date, text] of Object.entries(newsletters)) {
      const key = supportDateKey(date, currentMonth);
      if (key && officeAttendanceDateKeys.has(key) && text.trim()) byDate.set(key, {date, text:text.trim()});
    }
    for (const row of rows) {
      const key = supportDateKey(row.date, currentMonth);
      const text = row.content?.externalInfo?.trim();
      if (key && officeAttendanceDateKeys.has(key) && text) byDate.set(key, {date:row.date,text});
    }
    const sorted = [...byDate].sort(([a],[b])=>a.localeCompare(b));
    const count = sorted.length;
    const copyText = '【対象月】'+year+'年'+parseInt(month,10)+'月\n\n'+sorted.map(([,item])=>'■ '+item.date+'\n'+item.text+'\n').join('\n');

    return count ? copyText.trim()+'\n' : '';
  };

  // ---- Geminiでの変換結果を一括登録 ----
  const handleImportResults = (importedResults: Record<string, string>) => {
    let count = 0;
    const updatedRows = rows.map(row => {
      const resultText = importedResults[row.date];
      if (resultText !== undefined) {
        count++;
        return {
          ...row,
          content: {
            ...row.content,
            resultInfo: resultText,
            futurePlan: row.content.futurePlan?.trim() 
              ? row.content.futurePlan 
              : (futurePlans[row.date] || ""),
            isVerified: false
          }
        };
      }
      return row;
    });

    setRows(updatedRows);
    alert(`${count}件の日付について療育結果を登録しました。\n(自動保存されます)`);
    setIsResultImportOpen(false);
  };

  const addRow = () => {
    if (!planMeta) return;
    const mNum = parseInt(planMeta.month.split('-')[1] || '1', 10);
    const newDate = `${mNum}月1日`;
    if (planMeta.excludedDates?.includes(newDate)) {
      setPlanMeta(prev => prev ? {
        ...prev,
        excludedDates: prev.excludedDates?.filter(d => d !== newDate)
      } : prev);
    }
    setRows(prev => [...prev, {
      childId: childId!,
      planMonth: planMeta.month,
      date: newDate,
      staffId: '',
      type: 'tree_report',
      content: { externalInfo: '', supportContent: [], resultInfo: '', futurePlan: '' },
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]);
  };

  const confirmDeleteRow = () => {
    const scope = selectedOfficeId+'_'+childId+'_'+currentMonth;
    if (!deleteTarget || deleteTarget.scope!==scope) {setDeleteTarget(null);return;}
    const row = rows.find(item=>item.localKey===deleteTarget.row.localKey);
    if (!row?.localKey) {setDeleteTarget(null);return;}
    const requests = pendingRowDeletions.current.get(scope) || new Map<string,DailyReport>();
    requests.set(row.localKey,row);pendingRowDeletions.current.set(scope,requests);
    if (!rows.some(item=>item.localKey!==row.localKey && item.date===row.date)) {
      setPlanMeta(meta=>meta ? {...meta,excludedDates:[...new Set([...(meta.excludedDates||[]),String(row.date)])]} : meta);
    }
    setRows(previous=>previous.filter(item=>item.localKey!==row.localKey));
    setDeleteTarget(null);
  };

  const archiveRow = (idx: number) => {
    setRows(prev => {
      const toggled = prev[idx].archived;
      const updated = prev.map((r, i) => i === idx ? { ...r, archived: !toggled } : r);
      const active = updated.filter(r => !r.archived);
      const archived = updated.filter(r => r.archived);
      return [...active, ...archived];
    });
  };

  const updateRowDate = (idx: number, part: 'month' | 'day', val: string) => {
    setRows(prev => {
      const row = prev[idx];
      const currentMonth = row.date.match(/(\d+)月/)?.[1] ?? '';
      const currentDay = row.date.match(/(\d+)日/)?.[1] ?? '';
      const newDate = part === 'month'
        ? `${val}月${currentDay ? currentDay + '日' : ''}`
        : `${currentMonth ? currentMonth + '月' : ''}${val}日`;
        
      if (planMeta?.excludedDates?.includes(newDate)) {
        setPlanMeta(prev => prev ? {
          ...prev,
          excludedDates: prev.excludedDates?.filter(d => d !== newDate)
        } : prev);
      }
        
      const content = newsletters[newDate] || '';
      const plan = futurePlans[newDate] || '';

      return prev.map((r, i) => i === idx ? { 
        ...r, 
        date: newDate,
        content: {
          ...r.content,
          externalInfo: content || r.content.externalInfo,
          futurePlan: plan || r.content.futurePlan
        }
      } : r);
    });
  };

  const updateRowContent = (idx: number, field: keyof DailyReport['content'], value: any) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, content: { ...r.content, [field]: value } } : r
    ));
  };

  const toggleSupportContent = (rowIdx: number, option: string) => {
    const currentRow = rows[rowIdx];
    const currentSelected = currentRow.content.supportContent || [];

    if (!currentSelected.includes(option) && currentSelected.length >= 5) {
      alert('療育内容は5項目まで選択可能です。');
      return;
    }
    setRows(previous => previous.map((row, index) => {
      if (index !== rowIdx) return row;
      const selected = row.content.supportContent || [];
      const next = selected.includes(option) ? selected.filter(value => value !== option)
        : selected.length < 5 ? [...selected, option] : selected;
      return {...row, content: {...row.content, supportContent: next}};
    }));
  };

  const abortControllerRef = React.useRef<AbortController | null>(null);

  // コンポーネント離脱時にキャンセル & セキュリティのためキーをクリア
  useEffect(() => {
    sessionStorage.removeItem('GEMINI_API_KEY'); // 既存のキーがあれば削除
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      sessionStorage.removeItem('GEMINI_API_KEY'); // 離脱時にも念のため
    };
  }, []);



  // AI単一処理
  const handleSingleAiConvert = async (idx: number) => {
    if (isConverting) return;
    const row = rows[idx];
    if (!row.content.externalInfo?.trim()) {
      alert('変換対象のツリー通信がありません。');
      return;
    }

    let apiKey = sessionStorage.getItem('GEMINI_API_KEY') || '';
    if (!apiKey) {
      apiKey = window.prompt('Gemini APIキーを入力してください。\n(入力されたキーはセッション中のみ一時的に保持されます)') || '';
      if (apiKey) {
        sessionStorage.setItem('GEMINI_API_KEY', apiKey);
      }
    }
    if (!apiKey) return;

    setIsConverting(true);
    try {
      // モデルは aiConvert.ts 内で gemini-1.5-flash に完全固定済み。動的選択は行わない。
      const res = await convertToResult(row.content.externalInfo, apiKey, undefined, "1 / 1 (個別変換)");
      updateRowContent(idx, 'resultInfo', res);
      alert('変換が完了しました。');
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        if (e instanceof GeminiApiError) {
          setDebugError({
            message: e.message,
            ...e.debugInfo
          });
        } else if (e.debugInfo) {
          setDebugError({
            message: e.message,
            ...e.debugInfo
          });
        } else {
          setDebugError({
            message: e.message || String(e),
            url: 'N/A',
            model: 'N/A',
            payload: null,
            availableModels: []
          });
        }
      }
    } finally {
      setIsConverting(false);
    }
  };

  // 印刷は専用の固定レイアウトとリアルタイムプレビューで行う。
  const handlePrint = () => setIsPrintSettingsOpen(true);

  const getTargetGoalsText = (): string => supportGoalText(profPlan, availableProfPlans.length === 0 ? planMeta?.goals || '' : '');

  const getExportMeta = () => {
    let dateStr = new Date().toISOString();
    if (monthlySettings?.implementationYear && monthlySettings?.implementationMonth && monthlySettings?.implementationDay) {
      const year = 2018 + parseInt(monthlySettings.implementationYear, 10);
      const month = parseInt(monthlySettings.implementationMonth, 10);
      const day = parseInt(monthlySettings.implementationDay, 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`;
      }
    } else {
      dateStr = planMeta?.createdAt 
        ? (typeof planMeta.createdAt === 'string' 
            ? planMeta.createdAt 
            : (planMeta.createdAt as any).toDate?.()?.toISOString() || new Date().toISOString()) 
        : new Date().toISOString();
    }
    const creator = monthlySettings?.implementationCreator || loginStaffName;
    return { exportDate: dateStr, exportCreator: creator };
  };

  const handleDirectOverwriteExcel = async () => {
    if (!selectedChild || !planMeta) return;

    const targetGoals = getTargetGoalsText();

    const { exportDate: formattedCreatedAt, exportCreator } = getExportMeta();

    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'Excel Files',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
            }
          }]
        });
        
        if (handle) {
          setSaveStatus('saving');
          setExportLogs([]);
      setExportSheetName('');
          setTargetFileName(handle.name);
          const result = await overwriteExistingExcelFile(
            handle,
            selectedChild.fullName,
            planMeta.month,
            targetGoals,
            filterOfficeAttendanceRows(rows, officeAttendanceDateKeys, planMeta.month),
            exportCreator,
            formattedCreatedAt,
            (msg) => setExportLogs(prev => [...prev, msg])
          );
          setExportSheetName(result.sheetName);
          setSaveStatus('saved');
          setExportSuccessType('direct');
          setIsExportSuccessOpen(true);
          setTimeout(() => setSaveStatus('idle'), 2000);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('ユーザーがキャンセルしました。');
          return;
        }
        setExportLogs(prev => [...prev, `エラーが発生しました: ${err.message || err}`]);
        console.error(err);
        alert(`既存エクセルへの上書きに失敗しました: ${err.message || err}`);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } else {
      alert('このブラウザではファイルへの直接保存を利用できません。');
    }
  };

  // アンドゥ（元に戻す）ハンドラ
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0 || isUndoRedoing) return;
    const actionToUndo = undoStack[undoStack.length - 1];
    setIsUndoRedoing(true);

    try {
      // 削除操作のアンドゥの場合：画面ステートをスナップショットから即座に復元
      if (actionToUndo.actionType === 'delete') {
        isInitialLoad.current = true;
        if (actionToUndo.deletedRows && actionToUndo.deletedRows.length > 0) {
          setRows(prev => {
            const combined = [...prev, ...actionToUndo.deletedRows!];
            const dateMap = new Map<string, DailyReport>();
            combined.forEach(r => dateMap.set(r.date, r));
            return Array.from(dateMap.values()).sort((a, b) => {
              const parse = (s: string) => {
                const m = s.match(/(\d+)月(\d+)日/);
                return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
              };
              return parse(a.date) - parse(b.date);
            });
          });

          setFuturePlans(prev => {
            const next = { ...prev };
            actionToUndo.deletedRows!.forEach(r => {
              if (r.content?.futurePlan) {
                next[r.date] = r.content.futurePlan;
              }
            });
            return next;
          });
        }

        if (actionToUndo.deletedPlanMeta) {
          setPlanMeta(actionToUndo.deletedPlanMeta);
        }
      }

      await performUndo(actionToUndo);
      setUndoStack(prev => prev.slice(0, -1));
      setRedoStack(prev => [...prev, actionToUndo]);
      setRecentlyImportedDates(new Set()); // アンドゥ時はハイライトをクリア
      setHistoryToast({
        message: `「${actionToUndo.summary}」を元に戻しました`,
        type: 'undo',
        canRedo: true
      });
      await fetchData();
    } catch (err: any) {
      console.error('Undo error:', err);
      alert(`元に戻す処理に失敗しました: ${err.message || String(err)}`);
    } finally {
      setIsUndoRedoing(false);
    }
  }, [undoStack, isUndoRedoing, fetchData]);

  // リドゥ（やり直す）ハンドラ
  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0 || isUndoRedoing) return;
    const actionToRedo = redoStack[redoStack.length - 1];
    setIsUndoRedoing(true);

    try {
      // 削除操作のリドゥの場合：画面から即座に対象行を除去
      if (actionToRedo.actionType === 'delete') {
        isInitialLoad.current = true;
        if (actionToRedo.deletedRows && actionToRedo.deletedRows.length > 0) {
          const datesToDelete = new Set(actionToRedo.deletedRows.map(r => r.date));
          setRows(prev => prev.filter(r => !datesToDelete.has(r.date)));
          setFuturePlans(prev => {
            const next = { ...prev };
            datesToDelete.forEach(d => delete next[d]);
            return next;
          });
          setPlanMeta(prev => {
            if (!prev) return prev;
            const updated = Array.from(new Set([...(prev.excludedDates || []), ...Array.from(datesToDelete)]));
            return { ...prev, excludedDates: updated };
          });
        }
        if (actionToRedo.summary.includes('計画全削除')) {
          setPlanMeta(prev => prev ? { ...prev, goals: "" } : prev);
          setRows([]);
        }
      }

      await performRedo(actionToRedo);
      setRedoStack(prev => prev.slice(0, -1));
      setUndoStack(prev => [...prev, actionToRedo]);

      // リドゥ時は再度ハイライト
      const dateSet = new Set<string>();
      actionToRedo.after.dailyReports.forEach(r => {
        if (r.payload?.date) {
          const parts = r.payload.date.split('-');
          if (parts.length === 3) {
            dateSet.add(`${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`);
          } else {
            dateSet.add(r.payload.date);
          }
        }
      });
      setRecentlyImportedDates(dateSet);

      setHistoryToast({
        message: `「${actionToRedo.summary}」を再適用しました`,
        type: 'redo',
        canUndo: true
      });
      await fetchData();
    } catch (err: any) {
      console.error('Redo error:', err);
      alert(`やり直す処理に失敗しました: ${err.message || String(err)}`);
    } finally {
      setIsUndoRedoing(false);
    }
  }, [redoStack, isUndoRedoing, fetchData]);

  // Ctrl+Z / Ctrl+Y (Cmd+Z / Cmd+Y / Ctrl+Shift+Z) のショートカットキー対応
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // トースト自動消滅タイマー
  useEffect(() => {
    if (!historyToast) return;
    const timer = setTimeout(() => {
      setHistoryToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [historyToast]);



  if (isLoading || (!rawError && loadedScope.current !== activeScope.current) || (childrenData.length === 0 && !selectedChild)) {
    return (
      <div className="p-4 md:p-8 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded mb-8" />
        <div className="glass-panel overflow-hidden min-h-0">
          <div className="h-16 bg-slate-800" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 border-b border-slate-100 flex gap-4 p-4">
              <div className="w-16 bg-slate-100 rounded" />
              <div className="flex-1 bg-slate-50 rounded" />
              <div className="w-1/4 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedChild) return (
    <div className="p-20 text-center flex flex-col items-center gap-4 glass-panel max-w-md mx-auto mt-20">
      <div className="bg-red-50 p-4 rounded-lg border border-red-200 w-full text-left">
        <p className="text-red-700 font-bold mb-2">児童が見つかりません</p>
        <div className="text-[10px] text-slate-500 space-y-1">
          <p>対象ID: <span className="font-mono">{childId}</span></p>
          <p>読込済数: {childrenData.length}名</p>
          <p>ログイン: {auth.currentUser ? `OK (${auth.currentUser.email})` : '未ログイン'}</p>
        </div>
      </div>
      <button className="btn-primary w-full" onClick={() => navigate('/')}>一覧へ戻る</button>
    </div>
  );

  if (!planMeta) return (
    <div className="p-20 text-center flex flex-col items-center gap-4 glass-panel max-w-md mx-auto mt-20">
      <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 w-full text-left">
        <p className="text-amber-700 font-bold mb-2">書類データを読み込めませんでした</p>
        <div className="text-[10px] text-slate-500 space-y-1">
          <p>ログイン: <span className="font-mono text-amber-800">{auth.currentUser?.email || '未ログイン'}</span></p>
          <p>対象児童ID: <span className="font-mono">{childId}</span></p>
          {rawError && (
            <div className="mt-2 p-2 bg-red-100/50 rounded border border-red-200 text-[9px] font-mono break-all text-red-900">
              Error: {rawError}
            </div>
          )}
        </div>
      </div>
      <button className="btn-primary w-full" onClick={() => fetchData()}>再試行</button>
    </div>
  );


  return (
    <div id="support-impl-print" className="max-w-[1400px] mx-auto flex flex-col gap-8 print:gap-4 pb-20 print:pb-0 animate-fade-in">
      {rows.some(row => needsNewsletterReview(row, newsletters)) && <details className="order-first rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden">
        <summary className="cursor-pointer font-semibold">ツリー通信がない保存済み記録を確認（{rows.filter(row => needsNewsletterReview(row, newsletters)).length}件）</summary>
        <p className="mt-3 text-xs leading-relaxed">通信がなくても、保存済みの療育記録は残ります。内容を確認し、不要な行だけアーカイブしてください。元の記録は残り、表の行から戻せます。</p>
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-amber-50"><tr><th className="p-2">日付</th><th className="p-2">保存済みの結果・予定</th><th className="p-2">操作</th></tr></thead>
            <tbody>{rows.map((row, index) => needsNewsletterReview(row, newsletters) && <tr key={row.id} className="border-t border-amber-100">
              <td className="whitespace-nowrap p-2">{row.date}</td><td className="p-2">{(row.content.resultInfo || row.content.futurePlan || row.content.supportContent?.join('、') || '').slice(0, 100)}</td>
              <td className="p-2"><button type="button" onClick={() => archiveRow(index)} className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50">アーカイブ</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
      {/* 自動保存ステータスインジケーター */}
      {saveStatus !== 'idle' && (
        <div className="fixed bottom-24 right-6 z-50 flex items-center gap-2 pointer-events-none print:hidden">
          {saveStatus === 'saving' && (
            <div className="bg-slate-800/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-sm animate-fade-in border border-white/10">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span>自動保存中...</span>
            </div>
          )}
          {saveStatus === 'saved' && (
            <div className="bg-emerald-600/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-sm animate-fade-in border border-white/10">
              <Check size={14} />
              <span>変更を保存しました</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="bg-red-600/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-sm animate-fade-in border border-white/10">
              <span>保存に失敗しました</span>
            </div>
          )}
        </div>
      )}

      {mobileHeaderSlot&&createPortal(<div className="mobile-document-header pb-2">
        <DocumentTypeSelect childId={childId!} month={currentMonth} current="implementation"/>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1"><ChildSwitcher childId={childId!} name={selectedChild.fullName} childrenData={childrenData} officeId={selectedOfficeId} current="implementation" month={currentMonth}/></div>
          <div className="w-20 shrink-0"><MonthPicker value={currentMonth} onChange={month=>navigate(`/children/${childId}/support-plan/${month}`)}/></div>
          <SupportImplementationToolbar compact onAuthorSettings={()=>setIsAuthorSettingsOpen(true)} onPrint={handlePrint} onExport={()=>setTransferDirection('export')} onImport={()=>setTransferDirection('import')} onImportResults={()=>setIsResultImportOpen(true)} onHistory={()=>setIsChangeHistoryOpen(true)}/>
        </div>
      </div>,mobileHeaderSlot)}
      <div className="document-desktop-header flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white px-5 py-3 rounded-2xl border border-slate-200/80 shadow-sm shrink-0 print:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate('/monthly-summary')} aria-label="実施状況の表へ戻る" title="実施状況の表へ戻る" className="shrink-0 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="mt-0.5 min-w-0"><DocumentTypeSelect childId={childId!} month={currentMonth} current="implementation"/></h2>
            <ChildSwitcher childId={childId!} name={selectedChild.fullName} childrenData={childrenData} officeId={selectedOfficeId} current="implementation" month={currentMonth}/>
          </div>
        </div>

        <div className="w-full lg:w-auto lg:shrink-0">
          <SupportImplementationToolbar key={`${childId}_${selectedOfficeId}_${currentMonth}`}
            onAuthorSettings={()=>setIsAuthorSettingsOpen(true)}
            monthPicker={<MonthPicker layout="inline" value={currentMonth} onChange={month=>navigate(`/children/${childId}/support-plan/${month}`)}/>}
            onPrint={handlePrint}
            onExport={()=>setTransferDirection('export')} onImport={()=>setTransferDirection('import')}
            onImportResults={() => setIsResultImportOpen(true)} onHistory={() => setIsChangeHistoryOpen(true)}
          />
        </div>
      </div>
      {deleteTarget && deleteTarget.scope===selectedOfficeId+'_'+childId+'_'+currentMonth && <ViewportModal className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-900/50 p-4 print:hidden" onKeyDown={event=>{if(event.key==='Escape')setDeleteTarget(null);}}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="delete-row-title" aria-describedby="delete-row-description" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <h3 id="delete-row-title" className="text-base font-bold text-slate-800">{deleteTarget.row.date}の行を削除しますか？</h3>
          <p id="delete-row-description" className="mt-3 text-sm leading-relaxed text-slate-600">この行の療育内容・結果・今後の予定を削除します。ツリー通信の元データは残ります。</p>
          <div className="mt-6 flex justify-end gap-3"><button autoFocus type="button" onClick={()=>setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600">キャンセル</button><button type="button" onClick={confirmDeleteRow} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">削除する</button></div>
        </section>
      </ViewportModal>}
      {transferDirection&&<DocumentTransferModal scope={{book:'implementation',officeId:selectedOfficeId,month:currentMonth,children:childrenData,childId}} officeName={officeName} direction={transferDirection} beforeTransfer={async()=>{const signature=activeScope.current+':'+supportDraftSignature(planMeta,rows);await handleSave();if(lastSavedDraft.current!==signature)throw new Error('編集中の内容を保存できませんでした。保存状態を確認してください。');}} onImported={()=>fetchData()} onClose={()=>setTransferDirection(null)} onExcel={transferDirection==='export'?()=>void handleDirectOverwriteExcel():()=>setExcelImportOpen(true)}/>}
      {excelImportOpen&&<ViewportModal className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-900/60 p-4"><section role="dialog" aria-modal="true" aria-label="専門的支援実施計画のExcelインポート" className="flex h-[90dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white"><header className="flex justify-between border-b p-4"><h2 className="font-bold">Excelインポート</h2><button type="button" onClick={()=>setExcelImportOpen(false)} className="min-h-10 px-3">閉じる</button></header><div className="min-h-0 flex-1 overflow-y-auto p-4"><BatchExcelImport selectedOfficeId={selectedOfficeId} selectedMonth={currentMonth} childrenData={selectedChild?[selectedChild]:[]} onDataChange={()=>void fetchData()}/></div></section></ViewportModal>}
      {isAuthorSettingsOpen&&<ImplementationAuthorSettings key={selectedOfficeId+'_'+currentMonth} officeId={selectedOfficeId} officeName={officeName} month={currentMonth} onSaved={setMonthlySettings} onClose={()=>setIsAuthorSettingsOpen(false)}/>}
      {isChangeHistoryOpen && childId && <SupportChangeHistory key={`${selectedOfficeId}_${childId}_${currentMonth}`} officeId={selectedOfficeId} childId={childId} month={currentMonth} onClose={()=>setIsChangeHistoryOpen(false)} />}
      {isPrintSettingsOpen && <SupportImplementationPrintSettings
        key={`${childId}_${selectedOfficeId}_${currentMonth}`}
        documentData={{childName: selectedChild.fullName, officeName, month: planMeta.month,
          goals: getTargetGoalsText(),
          creator: getExportMeta().exportCreator,
          createdDate: (() => {const date = new Date(getExportMeta().exportDate); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {era: 'long', year: 'numeric', month: 'long', day: 'numeric'}).format(date) + '作成';})(),
        }}
        rows={prepareSupportPrintRows(filterOfficeAttendanceRows(rows, officeAttendanceDateKeys, currentMonth), currentMonth)}
        onClose={() => setIsPrintSettingsOpen(false)}
      />}


      <div className="glass-panel p-10 print:p-4 bg-white/95">
        {/* ===== 支援目標（個別支援計画書またはExcelインポートから共有） ===== */}
        {(() => {
          const hasImportedGoals = !!(planMeta.goals && planMeta.goals.trim());
          const isViewingImported = !profPlan && availableProfPlans.length === 0 && hasImportedGoals;
          const parsedGoals = hasImportedGoals ? parseGoalsText(planMeta.goals) : null;

          return (
            <div className="mb-4 bg-slate-50 rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b bg-white">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold flex items-center gap-2 uppercase">
                    <Target size={16} className="text-primary" /> 支援目標
                  </h3>
                  <div className="flex items-center gap-2 print:hidden">
                    <span className="text-xs font-bold text-slate-500">反映元:</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {profPlan ? '本案：'+supportGoalPlanMonth(profPlan).replace('-', '年')+'月開始分' : '対象月に有効な本案なし'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 print:hidden">
                  {isViewingImported ? (
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Excelインポート / 登録テキストより反映中
                    </span>
                  ) : profPlan ? null : (
                    <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">
                      ※対象月に有効な本案がありません（開始月を含む6か月）
                    </span>
                  )}
                </div>
              </div>

              {isViewingImported && parsedGoals ? (
                /* Excelインポート / 登録テキストの色分け表示 */
                <div className="p-5 print:p-3 flex flex-col gap-4 print:gap-2 text-sm print:text-xs print-tight-layout">
                  {/* 長期目標 */}
                  {parsedGoals.longTerm.length > 0 && (
                    <div className="flex gap-3">
                      <span className="shrink-0 text-[11px] font-bold text-slate-500 bg-slate-200 print:bg-white print:text-black print:text-[18px] print:border print:border-black px-2 py-0.5 rounded h-fit mt-0.5">長期目標</span>
                      <ul className="flex flex-col gap-1.5">
                        {parsedGoals.longTerm.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                            <span className="text-emerald-500 font-bold text-[11px] print:text-black print:text-[18px] mt-0.5">▸</span>
                            <span className="whitespace-pre-wrap print:text-black print:text-[18px] print:leading-tight">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 短期目標 */}
                  {parsedGoals.shortTerm.length > 0 && (
                    <div className="flex gap-3">
                      <span className="shrink-0 text-[11px] font-bold text-slate-500 bg-slate-200 print:bg-white print:text-black print:text-[18px] print:border print:border-black px-2 py-0.5 rounded h-fit mt-0.5">短期目標</span>
                      <ul className="flex flex-col gap-1.5">
                        {parsedGoals.shortTerm.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                            <span className="text-emerald-500 font-bold text-[11px] print:text-black print:text-[18px] mt-0.5">▸</span>
                            <span className="whitespace-pre-wrap print:text-black print:text-[18px] print:leading-tight">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 本人支援 (①②③) */}
                  {parsedGoals.personal.length > 0 && (
                    <div className="flex gap-3">
                      <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded h-fit mt-0.5 text-violet-700 bg-violet-100 print:bg-white print:text-black print:text-[18px] print:border print:border-black">
                        本人支援
                      </span>
                      <ul className="flex flex-col gap-1.5">
                        {parsedGoals.personal.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                            <span className="text-emerald-500 font-bold text-[11px] print:text-black print:text-[18px] mt-0.5">▸</span>
                            <span className="whitespace-pre-wrap print:text-black print:text-[18px] print:leading-tight">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 家族支援 (⑤) */}
                  {parsedGoals.family.length > 0 && (
                    <div className="flex gap-3">
                      <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded h-fit mt-0.5 text-emerald-700 bg-emerald-100 print:bg-white print:text-black print:text-[18px] print:border print:border-black">
                        家族支援
                      </span>
                      <ul className="flex flex-col gap-1.5">
                        {parsedGoals.family.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                            <span className="text-emerald-500 font-bold text-[11px] print:text-black print:text-[18px] mt-0.5">▸</span>
                            <span className="whitespace-pre-wrap print:text-black print:text-[18px] print:leading-tight">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 移行支援 (④) */}
                  {parsedGoals.transition.length > 0 && (
                    <div className="flex gap-3">
                      <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded h-fit mt-0.5 text-orange-700 bg-orange-100 print:bg-white print:text-black print:text-[18px] print:border print:border-black">
                        移行支援
                      </span>
                      <ul className="flex flex-col gap-1.5">
                        {parsedGoals.transition.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                            <span className="text-emerald-500 font-bold text-[11px] print:text-black print:text-[18px] mt-0.5">▸</span>
                            <span className="whitespace-pre-wrap print:text-black print:text-[18px] print:leading-tight">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* その他 */}
                  {parsedGoals.other.length > 0 && (
                    <div className="flex gap-3">
                      <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded h-fit mt-0.5 text-slate-600 bg-slate-200">
                        目標
                      </span>
                      <ul className="flex flex-col gap-1.5">
                        {parsedGoals.other.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                            <span className="text-emerald-500 font-bold text-[11px] mt-0.5">▸</span>
                            <span className="whitespace-pre-wrap">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : profPlan ? (
                /* 計画書からの色分け表示 */
                <div className="p-5 print:p-3 flex flex-col gap-4 print:gap-2 text-sm print:text-xs print-tight-layout">
                  {/* 長期目標 */}
                  <div className="flex gap-3">
                    <span className="shrink-0 text-[11px] font-bold text-slate-500 bg-slate-200 print:bg-white print:text-black print:text-[18px] print:border print:border-black px-2 py-0.5 rounded h-fit mt-0.5">長期目標</span>
                    <p className="whitespace-pre-wrap text-slate-700 print:text-black print:text-[18px] leading-relaxed print:leading-tight">
                      {profPlan.longTermGoal || <span className="text-slate-300 italic">未入力</span>}
                    </p>
                  </div>
                  {/* 短期目標 */}
                  <div className="flex gap-3">
                    <span className="shrink-0 text-[11px] font-bold text-slate-500 bg-slate-200 print:bg-white print:text-black print:text-[18px] print:border print:border-black px-2 py-0.5 rounded h-fit mt-0.5">短期目標</span>
                    <p className="whitespace-pre-wrap text-slate-700 print:text-black print:text-[18px] leading-relaxed print:leading-tight">
                      {profPlan.shortTermGoal || <span className="text-slate-300 italic">未入力</span>}
                    </p>
                  </div>
                  {/* 具体的な到達目標（カテゴリ別） */}
                  {(['本人支援', '家族支援', '移行支援'] as const).map((cat) => {
                    const catRows = (profPlan.supportRows ?? []).filter(r => r.category === cat && r.supportGoal?.trim());
                    if (catRows.length === 0) return null;
                    return (
                      <div key={cat} className="flex gap-3">
                        <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded h-fit mt-0.5 print:bg-white print:text-black print:text-[18px] print:border print:border-black ${cat === '本人支援' ? 'text-violet-700 bg-violet-100' :
                            cat === '家族支援' ? 'text-emerald-700 bg-emerald-100' :
                              'text-orange-700 bg-orange-100'
                          }`}>{cat}</span>
                        <ul className="flex flex-col gap-1.5">
                          {catRows.map((r, i) => (
                            <li key={r.id ?? i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                              <span className="text-emerald-500 font-bold text-[11px] print:text-black print:text-[18px] mt-0.5">▸</span>
                              <span className="whitespace-pre-wrap print:text-black print:text-[18px] print:leading-tight">{r.supportGoal}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 目標が何もない初期状態 */
                <div className="p-8 text-center text-slate-400 text-sm space-y-2">
                  <p className="font-semibold">支援目標が登録されていません</p>
                  <p className="text-xs text-slate-400">
                    個別支援計画書の本案に支援目標を入力すると、対象月に応じて自動反映されます。
                  </p>
                </div>
              )}
            </div>
          );
        })()}


        {/* モバイルは overflow 系を一切持たない素の div にする。
            overflow-x-hidden でもブラウザが「潜在的なスクロールコンテナ」と判断し
            縦スワイプを横スクロールとして吸収してしまうため。
            touch-action: pan-y をコンテナ自体に付与することで、
            子要素への個別指定不要で縦スクロールを最優先に伝播させる。
            PCは実際に横幅が必要なため md: 以降で overflow-x-auto を付与する。 */}
        <div
          className="md:overflow-x-auto rounded-xl border-2 border-slate-800 shadow-xl bg-white"
          style={{
            touchAction: 'pan-y',
            overscrollBehaviorX: 'contain',
            WebkitOverflowScrolling: 'touch' as any,
          }}
        >
          <div
            className={`w-full block md:table print:table print:table-fixed border-collapse ${isNewsletterCollapsed ? 'md:min-w-[850px] lg:min-w-[900px]' : 'md:min-w-[1000px] lg:min-w-[1100px]'} print:min-w-0 print:w-full`}
            style={{ touchAction: 'pan-y' }}
          >
            <div className="hidden md:table-header-group print:table-header-group sticky top-0 z-20">
              <div className="bg-slate-800 text-white text-[10px] md:text-xs print:bg-white print:text-black print:text-[20px] print:border-b-2 print:border-black shadow-sm md:table-row print:table-row">
                <div className="p-2 md:p-4 print:p-1 w-[60px] md:w-[80px] print:w-[8%] border-r border-slate-600 md:table-cell print:table-cell font-bold text-center align-middle">
                  <div className="flex flex-col items-center gap-1">
                    <span className="print:text-black print:text-[18px]">日付</span>
                    {Object.keys(newsletters).length > 0 && (
                      <button
                        onClick={syncAllDates}
                        title="日付をツリー通信と同期"
                        className="flex items-center gap-1 text-[10px] text-primary/80 bg-primary/10 hover:bg-primary/20 rounded px-1.5 py-0.5 transition-colors print:hidden"
                      >
                        <RefreshCw size={9} /> 日付同期
                      </button>
                    )}
                  </div>
                </div>
                <div className={`p-2 md:p-4 bg-primary border-r border-slate-600 print:hidden transition-all duration-300 relative group md:table-cell font-bold text-center align-middle ${isNewsletterCollapsed ? 'w-[50px] min-w-[50px]' : 'w-[25%] min-w-[180px] md:min-w-[240px]'}`}>
                  <div className="flex items-center justify-center gap-2">
                    {!isNewsletterCollapsed && <span>ツリー通信</span>}

                  </div>
                </div>
                <div className="p-2 md:p-4 print:p-1 border-r border-slate-600 w-[18%] print:w-[22%] min-w-[140px] md:min-w-[180px] print:min-w-0 md:table-cell print:table-cell font-bold text-center align-middle"><span className="print:text-black print:text-[18px]">療育内容</span></div>
                <div className="p-2 md:p-4 print:p-1 border-r border-slate-600 w-[25%] print:w-[40%] min-w-[200px] md:min-w-[280px] print:min-w-0 md:table-cell print:table-cell font-bold text-center align-middle"><span className="print:text-black print:text-[18px]">療育を行った結果</span></div>
                <div className="p-2 md:p-4 print:p-1 border-r border-slate-600 w-[18%] print:w-[30%] min-w-[140px] md:min-w-[200px] print:min-w-0 md:table-cell print:table-cell font-bold text-center align-middle"><span className="print:text-black print:text-[18px]">今後の予定</span></div>
                <div className="p-2 md:p-4 w-[70px] md:w-[80px] bg-slate-800 z-10 border-l border-slate-600 print:hidden md:table-cell font-bold text-center align-middle">
                  <div className="flex items-center justify-center gap-1.5 text-slate-400" title="アーカイブ">
                    <Archive size={13} />
                  </div>
                </div>
              </div>
            </div>
            <div className="block md:table-row-group print:table-row-group">
              {rows.map((row, idx) => (
                <SupportImplementationRow
                  key={`${row.date}-${idx}-${row.childId}`}
                  row={row}
                  idx={idx}
                  isNewsletterCollapsed={isNewsletterCollapsed}
                  isEditingDate={editingDateIdx === idx}
                  onEditDate={() => setEditingDateIdx(idx)}
                  onFinishEditDate={() => setEditingDateIdx(null)}
                  updateRowDate={updateRowDate}
                  toggleSupportContent={toggleSupportContent}
                  updateRowContent={updateRowContent}
                  handleSyncFromNewsletter={handleSyncFromNewsletter}
                  onDeleteRow={idx=>setDeleteTarget({scope:selectedOfficeId+'_'+childId+'_'+currentMonth,row:rows[idx]})}
                  archiveRow={archiveRow}
                  newsletters={newsletters}
                  onSingleAiConvert={handleSingleAiConvert}
                  isRecentlyImported={recentlyImportedDates.has(row.date)}
                />
              ))}
            </div>
          </div>
        </div>

        <button type="button" onClick={addRow} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:border-primary hover:bg-primary/5 hover:text-primary print:hidden"><Plus size={17} />行を追加</button>

        {/* ===== 印刷専用フッター ===== */}
        <div className="hidden print:flex justify-between items-end mt-12 print:mt-8 pt-6 border-t-2 border-slate-800 text-[11px] print:text-xl print:text-black print:font-bold page-break-inside-avoid">
          <div>
            令和&ensp;
            <span className="inline-block w-12 border-b-2 border-slate-800 text-center">
              {monthlySettings?.implementationYear || planMeta.month.split('-')[0]?.replace(/^\d{2}/, '') || ''}
            </span>
            年&ensp;
            <span className="inline-block w-10 border-b-2 border-slate-800 text-center">
              {monthlySettings?.implementationMonth || parseInt(planMeta.month.split('-')[1] || '0', 10)}
            </span>
            月&ensp;
            <span className="inline-block w-10 border-b-2 border-slate-800 text-center">
              {monthlySettings?.implementationDay || ''}
            </span>
            日作成&emsp;作成者：<span className="inline-block w-48 border-b-2 border-slate-800">{monthlySettings?.implementationCreator || ''}</span>
          </div>
          <div>（保護者署名）<span className="inline-block w-64 border-b-2 border-slate-800"></span></div>
        </div>
      </div>

      {/* Gemini療育結果一括登録モーダル */}
      <ResultImportModal
        isOpen={isResultImportOpen}
        onClose={() => setIsResultImportOpen(false)}
        monthStr={currentMonth}
        existingRows={rows}
        onGetSource={getTreeCommunicationsText}
        onImport={handleImportResults}
      />

      {/* AIデバッグエラーモーダル */}
      {debugError && (
        <ViewportModal className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto animate-fade-in print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col my-8 max-h-[85vh] animate-scale-up">
            {/* ヘッダー */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="bg-red-500/20 text-red-400 p-2 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">AI変換エラー詳細（デバッグ情報）</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Gemini APIとの通信時にエラーが発生しました</p>
                </div>
              </div>
              <button 
                onClick={() => setDebugError(null)}
                className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 text-slate-700">
              {/* レート制限のアラート (Retry-After) */}
              {debugError.retryAfter && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3 text-amber-900 animate-pulse">
                  <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Retry-After (APIレート制限)</p>
                    <p className="text-sm font-semibold">
                      Gemini APIからレート制限（429）が課されました。推奨される待機秒数: <span className="text-red-600 font-extrabold text-base px-1">{debugError.retryAfter}</span> 秒。
                      この時間が経過してから再試行してください。
                    </p>
                  </div>
                </div>
              )}

              {/* エラー内容 */}
              <div className="bg-red-50 border border-red-200/80 rounded-xl p-4 flex gap-3">
                <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-red-800 uppercase tracking-wider">エラー内容</p>
                  <p className="text-sm font-semibold text-red-950 break-all leading-relaxed">{debugError.message}</p>
                </div>
              </div>

              {/* 基本情報グリッド */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">実際に送信しているモデル名</p>
                  <code className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100/50 break-all">{debugError.model}</code>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">HTTPレスポンスステータス</p>
                  <span className={`text-xs font-black px-2 py-1 rounded border inline-block ${
                    debugError.httpStatus 
                      ? (debugError.httpStatus === 429 ? 'bg-red-50 text-red-700 border-red-200/50' : 'bg-amber-50 text-amber-700 border-amber-200/50')
                      : 'bg-slate-100 text-slate-600 border-slate-200/50'
                  }`}>
                    {debugError.httpStatus ? `HTTP ${debugError.httpStatus}` : 'N/A (送信前または接続エラー)'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">送信リクエスト進捗 (回数)</p>
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded border border-slate-200/50 inline-block">
                    {debugError.requestCount || '1 / 1'}
                  </span>
                </div>
              </div>

              {/* 送信URL */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">実際に送信しているURL</p>
                <div className="font-mono text-xs text-slate-600 break-all bg-white p-2 rounded border border-slate-200/50">
                  {debugError.url}
                </div>
              </div>

              {/* APIエラー詳細 JSON */}
              {debugError.errorDetails && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gemini APIエラー詳細 (error JSON)</p>
                  <pre className="font-mono text-xs text-red-600 bg-red-50/20 p-3 rounded border border-red-100/50 overflow-x-auto max-h-40 overflow-y-auto break-all whitespace-pre-wrap">
                    {JSON.stringify(debugError.errorDetails, null, 2)}
                  </pre>
                </div>
              )}

              {/* 利用可能モデル一覧 */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">利用可能なモデル一覧 (ListModels結果)</p>
                  {debugError.listModelsError && (
                    <span className="text-[10px] text-red-600 font-semibold bg-red-50 border border-red-100 px-2 py-0.5 rounded">ListModels取得エラー</span>
                  )}
                </div>
                <div className="font-mono text-xs text-slate-600 bg-white p-3 rounded border border-slate-200/50 max-h-40 overflow-y-auto space-y-1">
                  {debugError.availableModels.length > 0 ? (
                    debugError.availableModels.map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2 py-0.5 border-b border-slate-100 last:border-0">
                        <span className="text-slate-400 select-none text-[9px] w-4">{idx + 1}.</span>
                        <span className={m === debugError.model ? 'text-indigo-600 font-bold bg-indigo-50/50 px-1.5 rounded' : ''}>{m}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 italic">キャッシュデータ適用中 (または取得前にエラーが発生しました)</div>
                  )}
                  {debugError.listModelsError && (
                    <div className="mt-2 text-red-600 text-[10px] bg-red-50/30 p-2 rounded border border-red-100/50 break-all whitespace-pre-wrap">
                      【エラー詳細】: {debugError.listModelsError}
                    </div>
                  )}
                </div>
              </div>

              {/* リクエスト内容 (JSON) */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">送信リクエストボディ (JSON)</p>
                <pre className="font-mono text-xs text-slate-600 bg-white p-3 rounded border border-slate-200/50 overflow-x-auto max-h-40 overflow-y-auto">
                  {debugError.payload ? JSON.stringify(debugError.payload, null, 2) : 'N/A'}
                </pre>
              </div>

              {/* HTTPレスポンス詳細 */}
              {debugError.httpResponse && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">APIからの応答レスポンス (Raw)</p>
                  <pre className="font-mono text-xs text-slate-600 bg-white p-3 rounded border border-slate-200/50 overflow-x-auto max-h-40 overflow-y-auto break-all whitespace-pre-wrap">
                    {debugError.httpResponse}
                  </pre>
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={handleCopyDebugInfo}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm border transition-all ${
                  isCopied 
                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                    : 'bg-slate-800 border-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                {isCopied ? (
                  <>
                    <Check size={16} />
                    <span>コピー完了しました！</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    <span>デバッグ情報をコピー</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setDebugError(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold transition-all"
              >
                閉じる
              </button>
            </div>
          </div>
        </ViewportModal>
      )}

      {/* エクスポート完了モーダル */}
      {isExportSuccessOpen && (
        <ViewportModal className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full flex flex-col p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
              <Check size={24} className="stroke-[3]" />
            </div>
            
            <div className="space-y-2">
              <h3 className="font-black text-slate-800 text-lg">Excelの出力が完了しました</h3>
              <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">作成したシート：{exportSheetName}</p>
              <div className="text-slate-500 text-sm leading-relaxed space-y-2 text-left">
                {exportSuccessType === 'direct' ? (
                  <p>
                    選択されたファイル <span className="font-bold text-slate-700">「{targetFileName}」</span> に、原本から作成した対象月のシートを追加して保存しました。<br />
                    エクセルファイルを開き、データが更新されていることをご確認ください。
                  </p>
                ) : (
                  <p>
                    原本から対象月のシートを追加したExcelファイル <span className="font-bold text-slate-700">「{targetFileName}」</span> のダウンロードが開始されました。<br />
                    ダウンロードされたファイルを開いてデータをご確認ください。
                  </p>
                )}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-xs">
                  <p className="font-bold">💡 Webブラウザの制限に関する注意</p>
                  <p className="mt-1">
                    セキュリティ上の理由から、ブラウザから自動的にExcelアプリを直接起動して開くことはできません。<br />
                    ダウンロード完了後にブラウザのダウンロード履歴、または保存先のフォルダからファイルを開いてご確認ください。
                  </p>
                </div>
              </div>
            </div>
            
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => setIsExportSuccessOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-sm transition-all"
              >
                OK
              </button>
            </div>
          </div>
        </ViewportModal>
      )}

      {/* アンドゥ・リドゥ操作トースト */}
      {historyToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900/95 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-slate-700 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 text-sm font-medium">
            {historyToast.type === 'undo' ? (
              <Undo2 size={18} className="text-amber-400" />
            ) : historyToast.type === 'redo' ? (
              <Redo2 size={18} className="text-blue-400" />
            ) : (
              <Check size={18} className="text-emerald-400" />
            )}
            <span>{historyToast.message}</span>
          </div>

          <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-700">
            {undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                disabled={isUndoRedoing}
                className="px-2.5 py-1 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <Undo2 size={13} />
                <span>元に戻す</span>
              </button>
            )}
            {redoStack.length > 0 && (
              <button
                onClick={handleRedo}
                disabled={isUndoRedoing}
                className="px-2.5 py-1 text-xs font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <Redo2 size={13} />
                <span>やり直す</span>
              </button>
            )}
            <button
              onClick={() => setHistoryToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors ml-1 cursor-pointer"
              title="閉じる"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- メモ化された行コンポーネント ----




