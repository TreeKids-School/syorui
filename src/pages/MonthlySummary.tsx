import {notifyAccountTasksChanged} from '../lib/accountTaskEvents';
import {useAccountSummaryOrder} from '../hooks/useAccountSummaryOrder';
import {SUMMARY_COUNT_ROWS,normalizeHiddenCountRows,summaryCountValue,filterZeroAttendanceChildren} from '../lib/summaryTableRows';
import {AdoptionCalculationExample} from '../components/AdoptionCalculationExample';
import {loadCopySupportGoals} from '../lib/loadCopySupportGoals';
import {childGoalTreeSource} from '../lib/treeCommunicationCopy';
import {adoptedTreeCommunications} from '../lib/adoptedTreeCommunications';
import {implementationCompletionPath,completedImplementationChildren} from '../lib/implementationCompletion';
import {OfficeNavigationContext} from '../components/OfficeNavigationContext';
import {useIsMobile} from '../hooks/useIsMobile';
import {effectiveSummaryStaffFilter,filterSummaryStaff,resolveOwnStaffId} from '../lib/summaryStaffFilter';
import {DocumentChangeLog} from '../components/DocumentChangeLog';
import {appendDocumentAudit,auditDocumentWrite} from '../lib/documentAudit';
import {measureRead} from '../lib/readDiagnostics';
import {DocumentTransferModal} from '../components/DocumentTransferModal';
import {ProfessionalPlanBulkImportModal} from '../components/ProfessionalPlanBulkImportModal';
import {ProfessionalManagerSettings} from '../components/ProfessionalManagerSettings';
import {MonthlyTaskLabel} from '../components/MonthlyTaskLabel';
import {BatchSupportPrint} from '../components/BatchSupportPrint';
import type {BatchSupportPrintTarget} from '../components/BatchSupportPrint';
import {summarySupportPrintTargets} from '../lib/summarySupportPrintTargets';
import {resolveStaffColor} from '../lib/staffColor';
import {shiftCalendarMonth} from '../lib/calendarMonth';
import {MonthPicker} from '../components/ui/MonthPicker';
import {HeaderAccountActions} from '../components/HeaderAccountActions';
import {DropdownSelect} from '../components/ui/DropdownSelect';
import {ViewportModal} from '../components/ViewportModal';
import { ChildDocumentMenu } from '../components/ChildDocumentMenu';
import {summarizeStaffWritingDays} from '../lib/staffWritingSummary';
import { SummaryTableLayout } from '../components/SummaryTableLayout';
import type { SummaryTableOrientation } from '../components/SummaryTableLayout';
import { distributeStaffWorkload, applyStaffDistribution } from '../lib/distributeStaffWorkload';
import { BatchExcelExport } from '../components/BatchExcelExport';
import { BatchExcelImport } from '../components/BatchExcelImport';
import {excelExportOfficePriority} from '../lib/excelExportOfficeScope';
import {countSummaryAttendance, requiredSummaryDays,summaryAdoptionTargets} from '../lib/summaryAttendance';
import {getMonthlyTreeCommunications,invalidateMonthlyTreeCommunications} from '../lib/monthlyTreeCommunications';
import {summaryTreeReadDates} from '../lib/summaryTreeRead';
import {describeReadError} from '../lib/readError';
import { SettingsGroup, settingsRowClass } from '../components/SettingsGroup';
import { getMonthlySettings, monthlySettingsRef } from '../lib/monthlySettings';
import {SummaryPrintSettings} from '../components/SummaryPrintSettings';
import type { SummaryPrintOptions } from '../lib/printSummaryTable';
import { selectSpacedAdoptionDays, resolveAdoptionShortage } from '../lib/spacedAdoptionDays';
import type { AdoptionShortagePolicy, AdoptionCandidate } from '../lib/spacedAdoptionDays';
import { isAutoSelectCandidate } from '../lib/autoSelectWeek';
import { orderSummaryChildren, japanDateKey } from '../lib/summaryChildOrder';
import type { SummaryChildOrder } from '../lib/summaryChildOrder';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate,useSearchParams } from 'react-router-dom';
import { 
  Printer, Clock,
  ArrowDownUp,
  ChevronDown,
  Calendar, 
  Loader2, 
  ArrowLeft,
  AlertTriangle,
  Info,
  Settings as SettingsIcon,
  X,
  Check,
  Sparkles,
  HelpCircle,
  RotateCcw,
  Wand2,
  Users
} from 'lucide-react';

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  documentId,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Child } from '../data/mockData';
import { MonthlyResultImportModal } from '../components/MonthlyResultImportModal';
import { matchesOffice } from '../lib/officeUtils';

export interface StaffMember {
  id: string;
  name: string;
  officeId?: string;
  color: string;
}

export {STAFF_COLORS} from '../lib/staffColor';

export interface AttendanceInfo {
  officeId: string;
  officeName: string;
  isAbsent: boolean;
  isWaitlist: boolean;
  transportTime?: string;
  endTime?: string;
  pickupLocation?: string;
  assignedStaff?: string;
}


const SUMMARY_ORDER_OPTIONS:readonly {value:SummaryChildOrder;label:string}[]=[
  {value:'original',label:'元の順番'},
  {value:'staff',label:'スタッフごとにまとめる'},
  {value:'name-asc',label:'名前順（読み仮名・昇順）'},
  {value:'name-desc',label:'名前順（読み仮名・降順）'},
  {value:'today',label:'本日来る児童を先頭'},
  {value:'attendance-desc',label:'出席日数の多い順'},
  {value:'attendance-asc',label:'出席日数の少ない順'}
];

type StaffDisplayMode = 'icon' | 'icon-name' | 'name';

type MonthlySummaryProps = {
  childrenData: Child[];
  selectedOfficeId: string;
  onOfficeChange:(id:string)=>void;
  offices: { id: string; name: string }[];
};

export const MonthlySummary: React.FC<MonthlySummaryProps> = ({ 
  childrenData: allChildrenData,
  selectedOfficeId,
  onOfficeChange,
  offices 
}) => {
  const navigate = useNavigate();
  const [searchParams]=useSearchParams();
  const authorShortcut=searchParams.get('settings')==='implementation-author';
  const childrenData = useMemo(() => allChildrenData.filter(child => !child.archived), [allChildrenData]);
  
  // 現在の事業所名
  const currentOffice = offices.find(o => o.id === selectedOfficeId);
  const officeName = currentOffice ? currentOffice.name : 'Search';

  // 対象月 (YYYY-MM)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const requested=searchParams.get('month')||'';
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)?requested:japanDateKey().slice(0,7);
  });

  const [isLoading, setIsLoading] = useState(true);
  const [monthlyReadError, setMonthlyReadError] = useState('');
  const monthlyReadInFlight = useRef('');
  const isMobile=useIsMobile();
  const officeNavigation=React.useContext(OfficeNavigationContext);
  const [mobileStaffFilter,setStaffFilter]=useState(officeNavigation?.showAssignedOnlyByDefault===false?'all':'mine');
  const staffFilter=isMobile?mobileStaffFilter:'all';
  const [mobileHeaderSlot,setMobileHeaderSlot]=useState<HTMLElement|null>(null);
  useEffect(()=>{setMobileHeaderSlot(document.getElementById('mobile-summary-header-slot'));},[]);

  const settingsScrollRef=useRef<HTMLDivElement>(null);
  const scrollTableSetting=(section:string)=>{
    const root=settingsScrollRef.current,target=root?.querySelector<HTMLElement>('#summary-table-'+section);
    if(root&&target){const nav=root.querySelector<HTMLElement>('nav[aria-label="表の設定項目"]');const offset=window.matchMedia('(min-width: 768px)').matches?12:(nav?.offsetHeight||0)+12;root.scrollTo({top:root.scrollTop+target.getBoundingClientRect().top-root.getBoundingClientRect().top-offset,behavior:'smooth'});}
  };
  const {childOrder,setChildOrder,orderPreferenceError}=useAccountSummaryOrder(auth.currentUser?.uid||'');
  const [today, setToday] = useState(() => japanDateKey());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(japanDateKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // カレンダー設定 (休みの日・個別療育の日 - 曜日単位)
  const [summarySettings, setSummarySettings] = useState<{
    holidayDaysOfWeek: number[];
    individualDaysOfWeek: number[];
    holidayColor: string;
    individualColor: string;
    hiddenCountRows: string[];
    addIndividualDays: boolean;
    hideZeroAttendance: boolean;
    focusHighlightEnabled: boolean;
    staffDisplayMode: StaffDisplayMode;
    tableOrientation: SummaryTableOrientation;
  }>({
    holidayDaysOfWeek: [],
    individualDaysOfWeek: [],
    holidayColor: '#ffe4e6',
    individualColor: '#e0f2fe',
    hiddenCountRows: [] as string[],
    addIndividualDays: false,
    hideZeroAttendance: false,
    focusHighlightEnabled: true,
    staffDisplayMode: 'icon-name' as StaffDisplayMode,
    tableOrientation: 'children-columns' as SummaryTableOrientation,
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(authorShortcut);
  const [settingsDataChanged, setSettingsDataChanged] = useState(false);
  const [implementationTab, setImplementationTab] = useState<'author' | 'excel-import' | 'excel-export'>('author');
  const [transferRequest,setTransferRequest]=useState<{book:'implementation'|'professional';direction:'export'|'import'}|null>(null);
  const [professionalExcelImportOpen,setProfessionalExcelImportOpen]=useState(false);
  const [managerSettingsOffice,setManagerSettingsOffice]=useState<{id:string;name:string}|null>(null);
  const [settingsTab, setSettingsTab] = useState<'table' | 'implementation' | 'professional' | 'office'>(authorShortcut?'implementation':'table');
  const [implementationDraft, setImplementationDraft] = useState({ implementationCreator: '', implementationYear: '', implementationMonth: '', implementationDay: '' });
  const [inheritedMonthlySettings, setInheritedMonthlySettings] = useState<Record<string, unknown>>({});
  const [implementationSettingsKey, setImplementationSettingsKey] = useState('');
  const [implementationSettingsError, setImplementationSettingsError] = useState('');
  const [isImplementationSettingsLoading, setIsImplementationSettingsLoading] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isResultImportOpen, setIsResultImportOpen] = useState(false);
  const [loginStaffName, setLoginStaffName] = useState("");

  const [tempSettings, setTempSettings] = useState({
    holidayDaysOfWeek: [] as number[],
    individualDaysOfWeek: [] as number[],
    holidayColor: '#ffe4e6',
    individualColor: '#e0f2fe',
    hiddenCountRows: [] as string[],
    addIndividualDays: false,
    hideZeroAttendance: false,
    focusHighlightEnabled: true,
    staffDisplayMode: 'icon-name' as StaffDisplayMode,
    tableOrientation: 'children-columns' as SummaryTableOrientation,
  });

  // 各児童の選択された日（day: 1〜31 の Set）
  const [completedChildren,setCompletedChildren]=useState<{scope:string;ids:Set<string>}>({scope:'',ids:new Set()});
  const [selectedDaysMap, setSelectedDaysMap] = useState<Record<string, Set<number>>>({});
  const [savedSelectedDaysMap, setSavedSelectedDaysMap] = useState<Record<string, Set<number>>>({});
  const [isSavingAdoptions, setIsSavingAdoptions] = useState(false);
  const [adoptionSaveError, setAdoptionSaveError] = useState('');
  const adoptionSaveInFlight = useRef(false);
  const adoptionScope = useRef('');
  adoptionScope.current = `${selectedOfficeId}_${currentMonth}`;

  // フォーカス（ホバーハイライト）機能のON/OFF切り替え
  const isFocusHighlightEnabled = summarySettings.focusHighlightEnabled;
  const hiddenCountRows = summarySettings.hiddenCountRows;
  const countRowLabels = SUMMARY_COUNT_ROWS;
  const countRowTop = (index: number) => 144 + countRowLabels.slice(0, index).reduce((height, label) => height + (hiddenCountRows.includes(label) ? 0 : 28), 0);

  // スタッフ一覧および担当スタッフ割り当て
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [assignedStaffMap, setAssignedStaffMap] = useState<Record<string, string>>({});
  const [previousStaffAssignments, setPreviousStaffAssignments] = useState<Record<string, string>>({});
  const [staffAssignmentLoadedScope, setStaffAssignmentLoadedScope] = useState('');
  const [staffAssignmentLoadError, setStaffAssignmentLoadError] = useState('');
  const [staffAssignmentReload, setStaffAssignmentReload] = useState(0);
  const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
  const [isDocumentLogOpen,setIsDocumentLogOpen]=useState(false);
  const [isStaffSummaryOpen, setIsStaffSummaryOpen] = useState(false);
  const [isClearStaffOpen, setIsClearStaffOpen] = useState(false);
  const [staffActionError, setStaffActionError] = useState('');
  const [isAutoSelectOpen, setIsAutoSelectOpen] = useState(false);
  const [isMonthlyTasksOpen, setIsMonthlyTasksOpen] = useState(false);
  const [batchPrintTargets,setBatchPrintTargets]=useState<BatchSupportPrintTarget[]|null>(null);
  const [printSource,setPrintSource]=useState<HTMLTableElement|null>(null);
  const [printSettings, setPrintSettings] = useState<Pick<SummaryPrintOptions, 'orientation' | 'alignment' | 'stripeEvenColumns' | 'repeatDateMiddle' | 'repeatDateRight' | 'excludeZeroAttendance' | 'fontSize' | 'nameFontSize'>>({ orientation: 'landscape', alignment: 'center', stripeEvenColumns: false, repeatDateMiddle: false, repeatDateRight: false, excludeZeroAttendance: false,fontSize:9,nameFontSize:10.5 });
  const [autoSelectExcludedWeeks, setAutoSelectExcludedWeeks] = useState<number[]>([]);
  const [autoSelectGap, setAutoSelectGap] = useState('');
  const [shortagePolicy, setShortagePolicy] = useState<AdoptionShortagePolicy>('partial');
  const [relaxedGap, setRelaxedGap] = useState('1');
  const minimumAutoSelectGap = autoSelectGap === '' ? undefined : Number(autoSelectGap);
  const isAutoSelectGapValid = minimumAutoSelectGap === undefined || (Number.isInteger(minimumAutoSelectGap) && minimumAutoSelectGap >= 1 && minimumAutoSelectGap <= 31);
  const isRelaxedGapValid = shortagePolicy !== 'relax-gap' || (Number.isInteger(Number(relaxedGap)) && Number(relaxedGap) >= 1 && Number(relaxedGap) <= (minimumAutoSelectGap ?? 1));
  const [selectedStaffForDist, setSelectedStaffForDist] = useState<Set<string>>(new Set());
  const [staffPopoverAnchor, setStaffPopoverAnchor] = useState<{
    childId: string;
    x: number;
    y: number;
  } | null>(null);
  const [isSavingStaffAssignments, setIsSavingStaffAssignments] = useState(false);
  const [groupAdjacentColumns, setGroupAdjacentColumns] = useState(true); // 表の並び順で近接児童をなるべくまとめるオプション
  const [excludeIndividualWritingDays, setExcludeIndividualWritingDays] = useState(false);

  // ホバー中の児童列IDおよび日付行
  const [hoveredColChildId, setHoveredColChildId] = useState<string | null>(null);
  const [hoveredRowDay, setHoveredRowDay] = useState<number | null>(null);

  // モーダルが開かれたら設定状態を初期化
  useEffect(() => {
    if (isSettingsOpen) {
      setTempSettings({ ...summarySettings, hiddenCountRows: [...hiddenCountRows] });
    }
  }, [isSettingsOpen, summarySettings, hiddenCountRows]);

  
  useEffect(() => {
    if (!isSettingsOpen) return;
    let cancelled = false;
    setIsImplementationSettingsLoading(true);
    setImplementationSettingsKey('');
    setImplementationSettingsError('');
    getMonthlySettings(selectedOfficeId, currentMonth).then(snapshot => {
      if (cancelled) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      setImplementationDraft({ implementationCreator: String(data.implementationCreator ?? ''),
        implementationYear: String(data.implementationYear ?? ''), implementationMonth: String(data.implementationMonth ?? ''), implementationDay: String(data.implementationDay ?? '') });
      setInheritedMonthlySettings(snapshot.exists() && snapshot.id === currentMonth ? data : {});
      setImplementationSettingsKey(`${selectedOfficeId}_${currentMonth}`);
    }).catch(() => {
      if (!cancelled) setImplementationSettingsError('作成者・作成日の設定を読み込めませんでした。設定を開き直してください。');
    }).finally(() => { if (!cancelled) setIsImplementationSettingsLoading(false); });
    return () => { cancelled = true; };
  }, [isSettingsOpen, selectedOfficeId, currentMonth]);

  // 取得したマージ済みデータ
  const [mergedData, setMergedData] = useState<{
    dailyReports: Record<string, Record<string, any>>;
    treeCommTexts: Record<string, Record<string, string>>;
    treeCommFutures: Record<string, Record<string, string>>;
    attendance: Record<string, Record<string, AttendanceInfo>>;
  }>({
    dailyReports: {},
    treeCommTexts: {},
    treeCommFutures: {},
    attendance: {}
  });

  // 対象年の月・日数・曜日の計算
  const { year, month, daysArray, monthNum } = useMemo(() => {
    const [yStr, mStr] = currentMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    return { year: y, month: m, daysArray: days, monthNum: m };
  }, [currentMonth]);

  // ログインスタッフ情報のロード
  useEffect(() => {
    const loadStaff = async () => {
      if (auth.currentUser) {
        try {
          const staffSnap = await getDoc(doc(db, 'staff', auth.currentUser.uid));
          if (staffSnap.exists()) {
            const data = staffSnap.data();
            setLoginStaffName(data.name || data.fullName || "");
          }
        } catch (e) {
          console.error("Failed to load staff name:", e);
        }
      }
    };
    loadStaff();
  }, []);

  // 事業所に所属するスタッフ一覧の取得（Firestoreのstaffドキュメントに保存されているカラーを最優先）
  useEffect(() => {
    const fetchStaffList = async () => {
      try {
        const snap = await getDocs(collection(db, 'staff'));
        const list: StaffMember[] = [];
        let colorIdx = 0;



        snap.forEach(d => {
          const data = d.data();
          // アーカイブ済み・退職・無効化スタッフを除外
          if (
            data.archived === true || 
            data.isArchived === true || 
            data.status === 'archived' || 
            data.isDeleted === true ||
            data.deleted === true ||
            data.active === false
          ) {
            return;
          }

          const sOfficeId = data.officeId || '';
          const sOfficeIds = Array.isArray(data.officeIds) ? data.officeIds : [];
          // 選択事業所に所属しているスタッフ（または共通スタッフ）
          if (!sOfficeId || sOfficeId === selectedOfficeId || sOfficeIds.includes(selectedOfficeId)) {
            const name = data.name || data.fullName || '(名前なし)';
            // Firestore staff ドキュメント内の設定カラーを優先取得
            const rawColor = data.color || data.staffColor || data.themeColor || data.userColor || data.iconColor || data.avatarColor;
            const staffColor = resolveStaffColor(rawColor, colorIdx);

            list.push({
              id: d.id,
              name,
              officeId: sOfficeId,
              color: staffColor
            });
            colorIdx++;
          }
        });
        setStaffList(list);
        // デフォルトで全員チェック
        setSelectedStaffForDist(new Set(list.map(s => s.id)));
      } catch (e) {
        console.error("Failed to fetch staff list:", e);
      }
    };
    fetchStaffList();
  }, [selectedOfficeId]);

  // 月ごとの児童担当スタッフ割り当てのロード
  useEffect(() => {
    let cancelled = false;
    setStaffAssignmentLoadedScope('');
    setStaffAssignmentLoadError('');
    setPreviousStaffAssignments({});
    setAssignedStaffMap({});
    setExcludeIndividualWritingDays(false);
    const loadStaffAssignments = async () => {
      if (!selectedOfficeId || !currentMonth) return;
      try {
        const assignDocRef = doc(db, 'offices', selectedOfficeId, 'monthly_staff_assignments', currentMonth);
        const previousRef = doc(db, 'offices', selectedOfficeId, 'monthly_staff_assignments', shiftCalendarMonth(currentMonth, -1));
        const [snap, previousSnap] = await Promise.all([getDoc(assignDocRef), getDoc(previousRef)]);
        if (cancelled) return;
        setPreviousStaffAssignments(previousSnap.exists() ? previousSnap.data().assignments || {} : {});
        const distributionOptions = (snap.exists() ? snap.data().distributionOptions : undefined)
          ?? (previousSnap.exists() ? previousSnap.data().distributionOptions : undefined);
        setExcludeIndividualWritingDays(distributionOptions?.excludeIndividualDays === true);
        if (snap.exists()) {
          const data = snap.data();
          setAssignedStaffMap(data.assignments || {});
        } else {
          setAssignedStaffMap({});
        }
        setStaffAssignmentLoadedScope(`${selectedOfficeId}_${currentMonth}`);
      } catch (e) {
        console.error("Failed to load staff assignments:", e);
        if (!cancelled) setStaffAssignmentLoadError('担当者の履歴を読み込めませんでした。');
      }
    };
    loadStaffAssignments();
    return () => { cancelled = true; };
  }, [selectedOfficeId, currentMonth, staffAssignmentReload]);

  // 担当スタッフの手動更新 & 保存
  const logStaffAssignments=(batch:ReturnType<typeof writeBatch>,before:Record<string,string>,after:Record<string,string>)=>{
    for(const childId of new Set([...Object.keys(before),...Object.keys(after)]))if(before[childId]!==after[childId])appendDocumentAudit(batch,{officeId:selectedOfficeId,book:'implementation',childId,month:currentMonth,operation:'担当者の変更'},[{field:'担当スタッフ',action:after[childId]?'変更':'解除'}]);
  };
  const updateStaffAssignment = useCallback(async (childId: string, staffId: string | null) => {
    const newAssignments = { ...assignedStaffMap };
    if (staffId) {
      newAssignments[childId] = staffId;
    } else {
      delete newAssignments[childId];
    }
    setAssignedStaffMap(newAssignments);
    setStaffPopoverAnchor(null);

    try {
      const assignDocRef = doc(db, 'offices', selectedOfficeId, 'monthly_staff_assignments', currentMonth);
      const batch=writeBatch(db);batch.set(assignDocRef,{assignments:newAssignments,updatedAt:serverTimestamp()},{mergeFields:['assignments','updatedAt']});logStaffAssignments(batch,assignedStaffMap,newAssignments);await batch.commit();notifyAccountTasksChanged(selectedOfficeId);
    } catch (e) {
      console.error("Failed to save staff assignments:", e);
    }
  }, [assignedStaffMap, selectedOfficeId, currentMonth]);

  // ---- 全児童のツリー通信を一括コピー（療育結果が未記入のもののみ） ----
  const getAllTreeCommunicationsText = async () => {
    const scope=selectedOfficeId+'_'+currentMonth;
    const groups:{id:string;lines:string[]}[]=[];

    childrenData.forEach((child) => {
      if (!child.id) return;
      
      const childTexts = mergedData.treeCommTexts[child.id] || {};
      const childReports = mergedData.dailyReports[child.id] || {};
      const adoptedDates=new Set([...(selectedDaysMap[child.id]||[])].map(day=>monthNum+'月'+day+'日'));
      const attendance=new Set(Object.entries(mergedData.attendance[child.id]||{}).filter(([,entry])=>entry.officeId===selectedOfficeId&&!entry.isAbsent&&!entry.isWaitlist).map(([date])=>date));
      const sourceRows=Object.entries(childReports).map(([date,report])=>({...report,date}));
      const childRowsText=adoptedTreeCommunications(currentMonth,sourceRows,childTexts,attendance,adoptedDates,true).map(item=>'- '+item.date+': '+item.text);

      if (childRowsText.length > 0) {
        groups.push({id:child.id,lines:childRowsText});
      }
    });

    if(!groups.length)return '';
    const goals=await loadCopySupportGoals(selectedOfficeId,currentMonth,groups.map(group=>group.id));
    if(adoptionScope.current!==scope)throw new Error('表示する事業所または対象月が変わりました。もう一度コピーしてください。');
    return '【対象月】'+currentMonth+'\n\n'+groups.map(group=>childGoalTreeSource(group.id,goals[group.id]||'',group.lines)).join('\n\n');
  };

  // ---- Geminiでの一括変換結果を全員分インポート ----
  const handleImportAllResults = async (importedData: Record<string, Record<string, string>>) => {
    setIsLoading(true);
    try {
      let batch = writeBatch(db),batchRows=0;
      let count = 0;

      for (const childId of Object.keys(importedData)) {
        const childResults = importedData[childId];
        const child = childrenData.find(c => c.id === childId);
        if (!child) continue;

        const childReports = mergedData.dailyReports[childId] || {};
        const childTexts = mergedData.treeCommTexts[childId] || {};
        const childFutures = mergedData.treeCommFutures[childId] || {};

        for (const dateKey of Object.keys(childResults)) {
          const resultText = childResults[dateKey];
          const existingReport = childReports[dateKey];

          const mMatch = dateKey.match(/(\d+)月/);
          const dMatch = dateKey.match(/(\d+)日/);
          const mNum = mMatch ? parseInt(mMatch[1], 10) : 1;
          const dNum = dMatch ? parseInt(dMatch[1], 10) : 1;
          const pad = (n: number) => n.toString().padStart(2, '0');
          const formattedDate = `${year}-${pad(mNum)}-${pad(dNum)}`;

          const docId = existingReport?.id;
          const payload: any = {
            childId,
            planMonth: currentMonth,
            date: formattedDate,
            staffId: auth.currentUser?.uid || "",
            staffName: loginStaffName || "一括登録",
            type: 'tree_report',
            officeId: selectedOfficeId,
            updatedAt: serverTimestamp(),
          };

          if (docId) {
            const existingRef = doc(db, 'daily_reports', docId);
            payload.content = {
              ...existingReport.content,
              resultInfo: resultText,
              futurePlan: existingReport.content?.futurePlan?.trim()
                ? existingReport.content.futurePlan
                : (childFutures[dateKey] || ""),
              isVerified: false
            };
            payload.externalInfo = payload.content.externalInfo || "";
            appendDocumentAudit(batch,{officeId:selectedOfficeId,book:'implementation',childId,month:currentMonth,operation:'療育結果の一括登録'},[{date:dateKey,field:'療育を行った結果',action:'変更'}]);
            batch.update(existingRef, payload);
          } else {
            const newRef = doc(collection(db, 'daily_reports'));
            payload.createdAt = serverTimestamp();
            
            const externalInfo = childTexts[dateKey] || "";
            const futurePlan = childFutures[dateKey] || "";
            
            payload.content = {
              externalInfo,
              supportContent: [],
              resultInfo: resultText,
              futurePlan,
              isVerified: false
            };
            payload.externalInfo = externalInfo;
            payload.archived = false;
            appendDocumentAudit(batch,{officeId:selectedOfficeId,book:'implementation',childId,month:currentMonth,operation:'療育結果の一括登録'},[{date:dateKey,field:'療育を行った結果',action:'追加'}]);
            batch.set(newRef, payload);
          }

          const reportDoc = {
            results: {
              [childId]: {
                D: existingReport?.content?.externalInfo || childTexts[dateKey] || ""
              }
            },
            updatedAt: new Date().toISOString()
          };
          const reportRefNoPref = doc(db, 'reports', formattedDate);
          batch.set(reportRefNoPref, reportDoc, { merge: true });

          if (selectedOfficeId) {
            const reportRefPref = doc(db, 'reports', `${selectedOfficeId}_${formattedDate}`);
            batch.set(reportRefPref, reportDoc, { merge: true });
          }

          const childTreeDoc = {
            name: child.fullName || "",
            tree_comm_text: existingReport?.content?.externalInfo || childTexts[dateKey] || "",
            future_plan: existingReport?.content?.futurePlan || childFutures[dateKey] || "",
            pickupLocation: "",
            endTime: "",
            transportTime: "",
            notes: "",
            officeId: selectedOfficeId,
            office: selectedOfficeId === 'LNrWc8f6G703aUYRZ5e2' ? 'サーチ' : selectedOfficeId === 'nWioUcWXUskreYjmSL8p' ? 'ホーム' : '',
            updatedAt: new Date().toISOString()
          };
          const childTreeRefNoPref = doc(db, `children/${childId}/app_categories/書類管理/tree_communications`, formattedDate);
          batch.set(childTreeRefNoPref, childTreeDoc, { merge: true });

          const childTreeRefPref = doc(db, `children/${childId}/app_categories/書類管理/tree_communications`, `${selectedOfficeId}_${formattedDate}`);
          batch.set(childTreeRefPref, childTreeDoc, { merge: true });

          count++;batchRows++;
          if(batchRows>=50){await batch.commit();batch=writeBatch(db);batchRows=0;}
        }
      }

      if(batchRows)await batch.commit();
      alert(`計 ${count}件の療育結果をFirestoreに一括保存しました。`);
      setIsResultImportOpen(false);
      
      invalidateMonthlyTreeCommunications(selectedOfficeId,currentMonth);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      alert(`一括登録中にエラーが発生しました: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // データ取得処理
  const childrenForReads=useRef(childrenData);childrenForReads.current=childrenData;
  const childrenReadKey=JSON.stringify(childrenData.map(child=>[child.id,child.offices]));
  const fetchData = useCallback(async () => {
    const childrenData=childrenForReads.current;
    if (childrenData.length === 0) { setIsLoading(false); setMonthlyReadError(''); return; }
    const readScope = `${selectedOfficeId}_${currentMonth}`;
    if (monthlyReadInFlight.current === readScope) return;
    monthlyReadInFlight.current = readScope;
    setMonthlyReadError('');
    setIsLoading(true);
    
    try {
      // 1. daily_reports の一括取得
      const dailyQuery = query(
        collection(db, 'daily_reports'),
        where('planMonth', '==', currentMonth),
        where('officeId', '==', selectedOfficeId)
      );
      const [dailySnap,completionSnap]=await Promise.all([measureRead('実施状況・当月の日報',getDocs(dailyQuery)),measureRead('実施状況・当月の完了状態',getDoc(doc(db,...implementationCompletionPath(selectedOfficeId,currentMonth))))]);
      if(adoptionScope.current===readScope)setCompletedChildren({scope:readScope,ids:completedImplementationChildren(completionSnap.exists()?completionSnap.data():null)});
      
      const reportsGrouped: Record<string, Record<string, any>> = {};
      dailySnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const childId = data.childId;
        if (!childId) return;
        const child = childrenData.find(child => child.id === childId);
        if (!child || !excelExportOfficePriority(data, docSnap.id, child, selectedOfficeId, currentMonth)) return;

        let dateStr = "";
        let dObj: Date | null = null;
        if (data.date && typeof data.date.toDate === 'function') {
          dObj = data.date.toDate();
        } else if (typeof data.date === 'string') {
          const parts = data.date.split('-');
          if (parts.length === 3) {
            dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          } else {
            const parsed = new Date(data.date);
            if (!isNaN(parsed.getTime())) dObj = parsed;
          }
        }

        if (dObj) {
          if (dObj.getFullYear() === year && (dObj.getMonth() + 1) === month) {
            dateStr = `${dObj.getMonth() + 1}月${dObj.getDate()}日`;
          }
        }

        if (dateStr) {
          if (!reportsGrouped[childId]) reportsGrouped[childId] = {};
          const existing = reportsGrouped[childId][dateStr];
          const isArchived = data.archived === true;
          // すでにアクティブ（非アーカイブ）な日報が存在する場合、アーカイブ日報で上書きしない
          if (existing && !existing.archived && isArchived) {
            return;
          }
          reportsGrouped[childId][dateStr] = {
            id: docSnap.id,
            ...data,
            archived: isArchived,
            content: {
              externalInfo: data.content?.externalInfo || data.externalInfo || "",
              supportContent: data.content?.supportContent || [],
              resultInfo: data.content?.resultInfo || "",
              futurePlan: data.content?.futurePlan || "",
              isVerified: data.content?.isVerified || false,
            }
          };
        }
      });

      // 2. reports (ツリー通信および選択中事業所の出席情報) の一括取得
      const startPath = `${currentMonth}-01`;
      const endPath = `${currentMonth}-31`;
      const startPathPrefixed = `${selectedOfficeId}_${currentMonth}-01`;
      const endPathPrefixed = `${selectedOfficeId}_${currentMonth}-31`;

      const [reportsSnap1, reportsSnap2] = await Promise.all([
        getDocs(query(
          collection(db, 'reports'),
          where(documentId(), '>=', startPath),
          where(documentId(), '<=', endPath)
        )),
        selectedOfficeId ? getDocs(query(
          collection(db, 'reports'),
          where(documentId(), '>=', startPathPrefixed),
          where(documentId(), '<=', endPathPrefixed)
        )) : Promise.resolve(null)
      ]);

      const treeCommTextMap: Record<string, Record<string, string>> = {};
      const treeCommFutureMap: Record<string, Record<string, string>> = {};
      const treeCommFutureUpdatedAtMap: Record<string, Record<string, string>> = {};
      const treeCommTextUpdatedAtMap: Record<string, Record<string, string>> = {};
      const attendanceDataMap: Record<string, Record<string, AttendanceInfo>> = {};
      
      const processReportSnap = (snap: any) => {
        if (!snap) return;
        snap.forEach((d: any) => {
          const data = d.data();
          const parts = d.id.split('_');
          let docOfficeId: string | null = null;
          let dateStr = d.id;
          if (parts.length === 2) {
            docOfficeId = parts[0];
            dateStr = parts[1];
          }

          // 選択中の事業所のみを対象とする（他の事業所データは除外）
          if (docOfficeId && !matchesOffice(selectedOfficeId, docOfficeId)) {
            return;
          }
          if (data.officeId && !matchesOffice(selectedOfficeId, data.officeId)) {
            return;
          }
          if (data.office && !matchesOffice(selectedOfficeId, data.office)) {
            return;
          }

          const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!match) return;

          const yNum = parseInt(match[1], 10);
          const mNum = parseInt(match[2], 10);
          const dNum = parseInt(match[3], 10);

          if (yNum !== year || mNum !== month) return;
          const dateKey = `${mNum}月${dNum}日`;
          const updatedAtStr = data.updatedAt || data.createdAt || "";

          // A. 選択中事業所の出席予定データ（children と dailyTable）のパース
          if (Array.isArray(data.children)) {
            data.children.forEach((childItem: any) => {
              if (!childItem || !childItem.id) return;
              const cId = childItem.id;
              const child = childrenData.find(child => child.id === cId);
              if (!child || !excelExportOfficePriority(data, d.id, child, selectedOfficeId, currentMonth)) return;
              const tableItem = (data.dailyTable && typeof data.dailyTable === 'object') ? data.dailyTable[cId] : null;
              if ((childItem.officeId || childItem.office) && !excelExportOfficePriority(childItem, d.id, child, selectedOfficeId, currentMonth)) return;
              if ((tableItem?.officeId || tableItem?.office) && !excelExportOfficePriority(tableItem, d.id, child, selectedOfficeId, currentMonth)) return;

              const isAbsent = childItem.isAbsent === true || tableItem?.isAbsent === true;
              const isWaitlist = childItem.isWaitlist === true || tableItem?.isWaitlist === true;

              if (!attendanceDataMap[cId]) {
                attendanceDataMap[cId] = {};
              }

              attendanceDataMap[cId][dateKey] = {
                officeId: selectedOfficeId,
                officeName,
                isAbsent,
                isWaitlist,
                transportTime: tableItem?.transportTime || '',
                endTime: tableItem?.endTime || '',
                pickupLocation: tableItem?.pickupLocation || '',
                assignedStaff: tableItem?.assignedStaff || ''
              };
            });
          }

          // B. ツリー通信・今後の予定（選択中事業所のもののみ）
          childrenData.forEach(child => {
            if (!child.id) return;
            const childResult = data.results?.[child.id];
            if (childResult) {
              if (!excelExportOfficePriority(data, d.id, child, selectedOfficeId, currentMonth)) return;
              // reportsに出席児童一覧がある場合、その児童が含まれているか確認
              if (Array.isArray(data.children) && data.children.length > 0) {
                const isChildInDailyAttendance = data.children.some((c: any) => c?.id === child.id);
                if (!isChildInDailyAttendance) {
                  return;
                }
              }

              if (childResult.D) {
                const existingText = treeCommTextMap[child.id]?.[dateKey];
                const existingUpdate = treeCommTextUpdatedAtMap[child.id]?.[dateKey] || "";
                if (!existingText || !existingUpdate || updatedAtStr >= existingUpdate) {
                  if (!treeCommTextMap[child.id]) treeCommTextMap[child.id] = {};
                  treeCommTextMap[child.id][dateKey] = childResult.D;

                  if (!treeCommTextUpdatedAtMap[child.id]) treeCommTextUpdatedAtMap[child.id] = {};
                  treeCommTextUpdatedAtMap[child.id][dateKey] = updatedAtStr;
                }
              }

              // reports の results[child.id].futurePlan / future_plan
              const repFuture = childResult.futurePlan || childResult.future_plan;
              if (repFuture) {
                const existingPlan = treeCommFutureMap[child.id]?.[dateKey];
                const existingUpdate = treeCommFutureUpdatedAtMap[child.id]?.[dateKey] || "";
                if (!existingPlan || !existingUpdate || updatedAtStr >= existingUpdate) {
                  if (!treeCommFutureMap[child.id]) treeCommFutureMap[child.id] = {};
                  treeCommFutureMap[child.id][dateKey] = repFuture;

                  if (!treeCommFutureUpdatedAtMap[child.id]) treeCommFutureUpdatedAtMap[child.id] = {};
                  treeCommFutureUpdatedAtMap[child.id][dateKey] = updatedAtStr;
                }
              }
            }
          });
        });
      };

      processReportSnap(reportsSnap1);
      processReportSnap(reportsSnap2);

      // 3. 各児童の tree_communications サブコレクション取得
      await Promise.all(childrenData.map(async (child) => {
        if (!child.id) return;
        const dates = summaryTreeReadDates(currentMonth, attendanceDataMap[child.id], reportsGrouped[child.id]);
        if (!dates.length) return;
        try {
          const snap = await getMonthlyTreeCommunications(child.id, selectedOfficeId, currentMonth, dates);
          snap.forEach(d => {
            const data = d.data();
            if (!excelExportOfficePriority(data, d.id, child, selectedOfficeId, currentMonth)) return;
            const parts = d.id.split('_');
            let docOfficeId: string | null = null;
            let dateStr = d.id;
            if (parts.length === 2) {
              docOfficeId = parts[0];
              dateStr = parts[1];
            }

            // 1. 異なる事業所のIDプレフィックスならスキップ
            if (docOfficeId && !matchesOffice(selectedOfficeId, docOfficeId)) {
              return;
            }
            // データ内のofficeId / officeフィールドでのフィルタ
            if (data.officeId && !matchesOffice(selectedOfficeId, data.officeId)) {
              return;
            }
            if (data.office && !matchesOffice(selectedOfficeId, data.office)) {
              return;
            }

            // 2. 複数所属の児童で、事業所情報が一切無いデータは混同回避のためスキップ

            const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (match) {
              const yNum = parseInt(match[1], 10);
              const mNum = parseInt(match[2], 10);
              const dNum = parseInt(match[3], 10);
              
              if (yNum === year && mNum === month) {
                const dateKey = `${mNum}月${dNum}日`;
                const updatedAtStr = data.updatedAt || data.createdAt || "";

                const tcFuture = data.future_plan || data.futurePlan;
                if (tcFuture) {
                  const existingPlan = treeCommFutureMap[child.id!]?.[dateKey];
                  const existingUpdate = treeCommFutureUpdatedAtMap[child.id!]?.[dateKey] || "";
                  if (!existingPlan || !existingUpdate || updatedAtStr > existingUpdate) {
                    if (!treeCommFutureMap[child.id!]) treeCommFutureMap[child.id!] = {};
                    treeCommFutureMap[child.id!][dateKey] = tcFuture;
                    
                    if (!treeCommFutureUpdatedAtMap[child.id!]) treeCommFutureUpdatedAtMap[child.id!] = {};
                    treeCommFutureUpdatedAtMap[child.id!][dateKey] = updatedAtStr;
                  }
                }
                
                const tcText = data.tree_comm_text || (data.results?.[child.id!]?.D);
                if (tcText) {
                  const existingText = treeCommTextMap[child.id!]?.[dateKey];
                  const existingUpdate = treeCommTextUpdatedAtMap[child.id!]?.[dateKey] || "";
                  if (!existingText || !existingUpdate || updatedAtStr > existingUpdate) {
                    if (!treeCommTextMap[child.id!]) treeCommTextMap[child.id!] = {};
                    treeCommTextMap[child.id!][dateKey] = tcText;
                    
                    if (!treeCommTextUpdatedAtMap[child.id!]) treeCommTextUpdatedAtMap[child.id!] = {};
                    treeCommTextUpdatedAtMap[child.id!][dateKey] = updatedAtStr;
                  }
                }
              }
            }
          });
        } catch (err) {
          console.error(`Failed to fetch tree_communications for child ${child.id}:`, err);
          throw err;
        }
      }));

      if (adoptionScope.current !== readScope) return;
      setMergedData({
        dailyReports: reportsGrouped,
        treeCommTexts: treeCommTextMap,
        treeCommFutures: treeCommFutureMap,
        attendance: attendanceDataMap
      });

      // 既存の daily_reports から正式採用行 (archived !== true かつ 出席日) を初期選択状態にする
      const initialSelected: Record<string, Set<number>> = {};
      Object.entries(reportsGrouped).forEach(([cId, dateReports]) => {
        initialSelected[cId] = new Set<number>();
        Object.entries(dateReports).forEach(([dStr, rep]) => {
          if (rep.archived !== true) {
            const m = dStr.match(/(\d+)日/);
            if (m) {
              const dayNum = parseInt(m[1], 10);
              // 出席予定日（かつ欠席・キャンセル待ちでない日）のみを採用選択に含める
              const att = attendanceDataMap[cId]?.[dStr];
              const isAttending = !!(att && att.officeId === selectedOfficeId && !att.isAbsent && !att.isWaitlist);
              if (isAttending) {
                initialSelected[cId].add(dayNum);
              }
            }
          }
        });
      });
      setSelectedDaysMap(initialSelected);
      setSavedSelectedDaysMap(initialSelected);

      // 4. 事業所サマリー設定の取得
      try {
        const settingsSnap = await getDoc(doc(db, 'officeSummarySettings', selectedOfficeId));
        if (adoptionScope.current !== readScope) return;
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setSummarySettings({
            holidayDaysOfWeek: data.holidayDaysOfWeek || [],
            individualDaysOfWeek: data.individualDaysOfWeek || [],
            holidayColor: data.holidayColor || '#ffe4e6',
            individualColor: data.individualColor || '#e0f2fe',
            addIndividualDays: data.addIndividualDays === true,
            hideZeroAttendance: data.hideZeroAttendance === true,
            focusHighlightEnabled: data.focusHighlightEnabled !== false,
            tableOrientation: data.tableOrientation === 'children-rows' ? 'children-rows' : 'children-columns',
            staffDisplayMode: ['icon', 'icon-name', 'name'].includes(data.staffDisplayMode) ? data.staffDisplayMode : 'icon-name',
            hiddenCountRows: normalizeHiddenCountRows(data.hiddenCountRows),
          });
        } else {
          setSummarySettings({
            holidayDaysOfWeek: [],
            individualDaysOfWeek: [],
            holidayColor: '#ffe4e6',
            individualColor: '#e0f2fe',
    hiddenCountRows: [] as string[],
    addIndividualDays: false,
    hideZeroAttendance: false,
    focusHighlightEnabled: true,
    staffDisplayMode: 'icon-name' as StaffDisplayMode,
    tableOrientation: 'children-columns' as SummaryTableOrientation,
          });
        }
      } catch (err) {
        console.error("Error fetching summary settings:", err);
        throw err;
      }
    } catch (error) {
      console.error("Error fetching monthly data:", error);
      if (adoptionScope.current === readScope) setMonthlyReadError(describeReadError(error));
    } finally {
      if (adoptionScope.current === readScope) setIsLoading(false);
      if (monthlyReadInFlight.current === readScope) monthlyReadInFlight.current = '';
    }
  }, [currentMonth, selectedOfficeId, childrenReadKey, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isSettingsOpen && settingsDataChanged) {
      setSettingsDataChanged(false);
      void fetchData();
    }
  }, [isSettingsOpen, settingsDataChanged, fetchData]);

  // 採用日は緑枠、出席予定は〇、今後の予定ありは◎を優先表示
  const getCellDetails = (childId: string, day: number) => {
    const dateKey = `${monthNum}月${day}日`;
    
    // 出席情報（選択中事業所の出席予定）
    const att = mergedData.attendance[childId]?.[dateKey];
    const isAttending = !!(att && att.officeId === selectedOfficeId && !att.isAbsent && !att.isWaitlist);

    // 記録情報（該当事業所の出席日、または当事業所の日報がある日のみツリー通信をセルに反映）
    const report = mergedData.dailyReports[childId]?.[dateKey];
    const isReportSaved = !!report?.id;
    const isRelevantDay = isAttending || isReportSaved;

    const treeText = isRelevantDay ? (mergedData.treeCommTexts[childId]?.[dateKey] || "") : "";
    const treeFuture = isRelevantDay ? (mergedData.treeCommFutures[childId]?.[dateKey] || "") : "";

    const futurePlan = report?.content?.futurePlan || treeFuture || "";
    const externalInfo = report?.content?.externalInfo || treeText || "";

    const hasFuture = futurePlan.trim() !== "";
    const hasTree = externalInfo.trim() !== "" && isRelevantDay;

    const isAdopted = isAttending && (selectedDaysMap[childId]?.has(day) ?? false);
    const isReportArchived = !isAdopted && (hasTree || report?.archived === true);

    const borderClass = isAdopted ? "ring-2 ring-inset ring-emerald-600 font-bold z-[1]" : "";
    const content = <>
      {hasFuture
        ? <span aria-label="今後の予定あり">◎</span>
        : isAttending ? <span aria-label="出席予定あり">〇</span> : null}
    </>;
    const baseClass = hasFuture ? "text-green-600 font-bold hover:bg-green-50/50" : "hover:bg-slate-50";
    return {
      content,
      className: `${baseClass} ${borderClass}`.trim(),
      isAttending,
      hasFuture,
      isAdopted,
      isReportSaved,
      isReportArchived
    };
  };

  // 曜日の色分け用
  const getDayOfWeekDetails = (day: number) => {
    const dObj = new Date(year, month - 1, day);
    const dayIndex = dObj.getDay();
    const dayStr = ['日', '月', '火', '水', '木', '金', '土'][dayIndex];
    let className = "text-slate-600";
    if (dayIndex === 0) className = "text-red-500 font-semibold bg-red-50/20";
    if (dayIndex === 6) className = "text-blue-500 font-semibold bg-blue-50/20";
    return { dayStr, className };
  };

  // 児童の放課後デイサービス判定 (true: 放課後等デイサービス, false: 児童発達支援)
  const isChildHoukagoDay = useCallback((child: Child): boolean => {
    const c = child as any;
    if (typeof c.isHoukagoDay === 'boolean') {
      return c.isHoukagoDay;
    }
    if (c.serviceType) {
      if (String(c.serviceType).includes('放課後')) return true;
      if (String(c.serviceType).includes('児童発達支援') || String(c.serviceType).includes('児発')) return false;
    }
    if (c.serviceCategory) {
      if (String(c.serviceCategory).includes('放課後')) return true;
      if (String(c.serviceCategory).includes('児童発達支援') || String(c.serviceCategory).includes('児発')) return false;
    }
    // 学年からの推測
    if (child.grade) {
      const g = String(child.grade);
      if (g.includes('小') || g.includes('中') || g.includes('高')) return true;
      if (g.includes('幼') || g.includes('保') || g.includes('未就学')) return false;
    }
    // 年齢からの推測 (6歳以上なら放課後デイ)
    if (typeof child.age === 'number') {
      if (child.age >= 6) return true;
      if (child.age < 6) return false;
    }
    return true; // デフォルトは放課後デイ
  }, []);

  // 児童のその月の出席日数（総出席、個別療育出席、集団療育出席）の計算
  const getChildAttendanceDetails = useCallback((childId: string) => {
    return countSummaryAttendance(daysArray, monthNum, selectedOfficeId, mergedData.attendance[childId],
      day => summarySettings.individualDaysOfWeek.includes(new Date(year, month - 1, day).getDay()));
  }, [daysArray, monthNum, mergedData.attendance, selectedOfficeId, year, month, summarySettings.individualDaysOfWeek]);

  // 必要日数の計算
  // 出席0日は0、1日は1。
  // 放デイ（小学生以上）：出席12日以上で6日分、出席6～12未満で4日分、出席6日未満で2日分（0日なら0）
  // 児発（幼児以下）：出席12日以上で6回、出席12日未満で4回（0日なら0）
  const getChildRequiredDays = useCallback((child: Child, attCount: number): number => {
    return requiredSummaryDays(attCount, isChildHoukagoDay(child));
  }, [isChildHoukagoDay]);

  // 全児童の当月出席日数および必要日数の集計マップ
  const childAttendanceStats = useMemo(() => {
    const stats: Record<string, { 
      attendanceCount: number; 
      individualCount: number;
      nonIndividualCount: number;
      requiredDays: number; 
      baseRequiredDays: number;
      isHoukago: boolean 
    }> = {};

    childrenData.forEach(child => {
      if (!child.id) return;
      const { totalCount, individualCount } = getChildAttendanceDetails(child.id);
      const isHoukago = isChildHoukagoDay(child);
      const baseReqDays = getChildRequiredDays(child, totalCount);
      const {requiredDays:reqDays,nonIndividualCount}=summaryAdoptionTargets(baseReqDays,individualCount,totalCount,summarySettings.addIndividualDays);
      stats[child.id] = { 
        attendanceCount: totalCount, 
        individualCount,
        nonIndividualCount,
        requiredDays: reqDays, 
        baseRequiredDays: baseReqDays,
        isHoukago 
      };
    });
    return stats;
  }, [childrenData, getChildAttendanceDetails, isChildHoukagoDay, getChildRequiredDays,summarySettings.addIndividualDays]);

  const orderedChildren = useMemo(() => {
    const attendingToday = new Set<string>();
    if (currentMonth === today.slice(0, 7)) {
      const todayKey = `${Number(today.slice(5, 7))}月${Number(today.slice(8, 10))}日`;
      childrenData.forEach(child => {
        if (!child.id) return;
        const att = mergedData.attendance[child.id]?.[todayKey];
        if (att?.officeId === selectedOfficeId && !att.isAbsent && !att.isWaitlist) attendingToday.add(child.id);
      });
    }
    return orderSummaryChildren(childrenData, childOrder, {
      assignedStaff: assignedStaffMap, staff: staffList, attendanceCounts: childAttendanceStats, attendingToday
    });
  }, [childrenData, childOrder, assignedStaffMap, staffList, childAttendanceStats, mergedData.attendance, selectedOfficeId, currentMonth, today]);

  const ownStaffId=resolveOwnStaffId(staffList,auth.currentUser?.uid||'',loginStaffName);
  const staffFilterReady=staffAssignmentLoadedScope===selectedOfficeId+'_'+currentMonth;
  const effectiveStaffFilter=effectiveSummaryStaffFilter(staffFilter,staffFilterReady,ownStaffId);
  const assignedOnlyToggles=isMobile&&(!staffFilterReady||!!ownStaffId)?[{label:'担当児童のみ表示',checked:effectiveStaffFilter==='mine',onChange:(checked:boolean)=>setStaffFilter(checked?'mine':'all')}]:[];
  const sortedChildren=useMemo(()=>effectiveStaffFilter!=='all'&&!staffFilterReady?[]:filterZeroAttendanceChildren(filterSummaryStaff(orderedChildren,assignedStaffMap,effectiveStaffFilter,ownStaffId),childAttendanceStats,summarySettings.hideZeroAttendance),[orderedChildren,assignedStaffMap,effectiveStaffFilter,ownStaffId,staffFilterReady,summarySettings.hideZeroAttendance,childAttendanceStats]);

  // 割り振り用の記入数。採用日や表の必要日数そのものは変更しない。
  const childAdoptedDayCounts = useMemo(() => Object.fromEntries(childrenData.filter(child => child.id).map(child => {
    const counts = countSummaryAttendance([...(selectedDaysMap[child.id!] || [])], monthNum, selectedOfficeId, mergedData.attendance[child.id!],
      day => summarySettings.individualDaysOfWeek.includes(new Date(year, month - 1, day).getDay()));
    return [child.id!, counts];
  })), [childrenData, selectedDaysMap, mergedData.attendance, monthNum, selectedOfficeId, year, month, summarySettings.individualDaysOfWeek]);
  const individualOnlyChildren = useMemo(() => Object.entries(childAdoptedDayCounts)
    .filter(([, counts]) => counts.totalCount > 0 && counts.nonIndividualCount === 0).map(([id]) => id), [childAdoptedDayCounts]);
  const childWritingDays = useMemo(() => Object.fromEntries(Object.entries(childAdoptedDayCounts).map(([id, counts]) =>
    [id, counts.nonIndividualCount === 0 ? 0 : excludeIndividualWritingDays ? counts.nonIndividualCount : counts.totalCount]
  )), [childAdoptedDayCounts, excludeIndividualWritingDays]);

  const staffWritingSummary = useMemo(() => summarizeStaffWritingDays(childAttendanceStats, assignedStaffMap), [childAttendanceStats, assignedStaffMap]);
  const staffWritingRows = useMemo(() => [
    ...staffList.map(staff => ({...staff, ...(staffWritingSummary[staff.id] || {childCount: 0, days: 0})})),
    ...Object.keys(staffWritingSummary).filter(id => id && !staffList.some(staff => staff.id === id)).map(id => ({id, name: '未登録スタッフ', color: '#94a3b8', ...staffWritingSummary[id]})),
    {id: '', name: '未割り当て', color: '#94a3b8', ...(staffWritingSummary[''] || {childCount: 0, days: 0})},
  ], [staffList, staffWritingSummary]);
  const handleClearStaffAssignments = async () => {
    const scope = `${selectedOfficeId}_${currentMonth}`;
    if (isSavingStaffAssignments || staffAssignmentLoadedScope !== scope) return;
    setIsSavingStaffAssignments(true);
    setStaffActionError('');
    try {
      const batch=writeBatch(db);batch.set(doc(db,'offices',selectedOfficeId,'monthly_staff_assignments',currentMonth),{assignments:{},updatedAt:serverTimestamp()},{mergeFields:['assignments','updatedAt']});logStaffAssignments(batch,assignedStaffMap,{});await batch.commit();notifyAccountTasksChanged(selectedOfficeId);
      if (adoptionScope.current === scope) {
        setAssignedStaffMap({});
        setIsClearStaffOpen(false);
      }
    } catch {
      if (adoptionScope.current === scope) setStaffActionError('担当の全解除に失敗しました。もう一度お試しください。');
    } finally {
      setIsSavingStaffAssignments(false);
    }
  };

  const distributionPreview = useMemo(() => distributeStaffWorkload(
    orderedChildren.filter(child => child.id && childWritingDays[child.id] > 0).map(child => ({ id: child.id!, days: childWritingDays[child.id!] })),
    [...selectedStaffForDist], groupAdjacentColumns, previousStaffAssignments
  ), [orderedChildren, childWritingDays, selectedStaffForDist, groupAdjacentColumns, previousStaffAssignments]);
  const distributionTotals = Object.values(distributionPreview).map(bucket => bucket.totalDays);
  const distributionRange = distributionTotals.length ? Math.max(...distributionTotals) - Math.min(...distributionTotals) : 0;
  const hasStaffDistributionChanges = distributionTotals.some(days => days > 0) || individualOnlyChildren.some(id => assignedStaffMap[id]);

  const handleDistributeRequiredDays = useCallback(async () => {
    if (selectedStaffForDist.size === 0 || isSavingStaffAssignments || staffAssignmentLoadedScope !== `${selectedOfficeId}_${currentMonth}`) return;
    const staffBuckets = distributionPreview;
    if (!hasStaffDistributionChanges) return;
    const newAssignments = applyStaffDistribution(assignedStaffMap, staffBuckets, individualOnlyChildren);

    setAssignedStaffMap(newAssignments);
    setIsDistributeModalOpen(false);

    try {
      setIsSavingStaffAssignments(true);
      const assignDocRef = doc(db, 'offices', selectedOfficeId, 'monthly_staff_assignments', currentMonth);
      const batch=writeBatch(db);batch.set(assignDocRef,{assignments:newAssignments,distributionOptions:{excludeIndividualDays:excludeIndividualWritingDays},updatedAt:serverTimestamp()},{mergeFields:['assignments','distributionOptions.excludeIndividualDays','updatedAt']});logStaffAssignments(batch,assignedStaffMap,newAssignments);await batch.commit();notifyAccountTasksChanged(selectedOfficeId);
    } catch (e) {
      console.error("Failed to save distributed staff assignments:", e);
    } finally {
      setIsSavingStaffAssignments(false);
    }
  }, [selectedStaffForDist, distributionPreview, isSavingStaffAssignments, assignedStaffMap, selectedOfficeId, currentMonth, staffAssignmentLoadedScope, excludeIndividualWritingDays, hasStaffDistributionChanges, individualOnlyChildren]);

  const handleCellMouseEnter = useCallback((child: Child, day: number) => {
    setHoveredColChildId(child.id || null);
    setHoveredRowDay(day);
  }, []);

  const handleCellMouseLeave = useCallback(() => {
    setHoveredColChildId(null);
    setHoveredRowDay(null);
  }, []);

  // 組み合わせ生成ヘルパー (n個からk個選ぶ)
  const getCombinations = useCallback(<T,>(array: T[], k: number): T[][] => {
    if (k === 0) return [[]];
    if (array.length < k) return [];
    if (array.length === k) return [array];
    
    const result: T[][] = [];
    const backtrack = (start: number, current: T[]) => {
      if (current.length === k) {
        result.push([...current]);
        return;
      }
      for (let i = start; i < array.length; i++) {
        current.push(array[i]);
        backtrack(i + 1, current);
        current.pop();
      }
    };
    backtrack(0, []);
    return result;
  }, []);

  // 必要日数分を自動選択（提案）
  // ルール:
  // 1. 個別療育の出席日はすべて必ず採用
  // 2. 採用は最大（マックス）で6日
  // 3. 採用数が上限に達した場合（または達する見込みの場合）、個別の日以外の採用を排除
  // 4. 可能な限り日数の間隔を均等に空けつつ（連日を極力避けて分散）、必要日数を選択
  const autoSelectionPreview = useMemo(() => {
    if (!isAutoSelectOpen || !isAutoSelectGapValid || !isRelaxedGapValid) return null;
    const excludedWeeks = autoSelectExcludedWeeks;
    const minimumGap = minimumAutoSelectGap;
    const newSelected = { ...selectedDaysMap };
    const details: { id: string; name: string; target: number; initial: number; selected: number; kept: boolean; gap?: number }[] = [];
    const recordSelection = (child: Child, target: number, initialDays: number[], candidates: AdoptionCandidate[]) => {
      const resolved = resolveAdoptionShortage({ candidates, target, initialDays,
        existingDays: [...(selectedDaysMap[child.id!] || [])], policy: shortagePolicy,
        minimumGap, relaxedMinimumGap: Number(relaxedGap) });
      newSelected[child.id!] = new Set(resolved.days);
      if (initialDays.length < target) details.push({ id: child.id!, name: child.fullName, target,
        initial: initialDays.length, selected: resolved.days.length, kept: resolved.kept, gap: resolved.gap });
    };
      childrenData.forEach(child => {
        if (!child.id) return;
        const cId = child.id;
        const stat = childAttendanceStats[cId];
        const reqDays = stat?.requiredDays ?? 0;
        if (reqDays === 0) {
          newSelected[cId] = new Set();
          return;
        }

        // 採用上限は最大6日
        const maxLimit = 6;
        const targetDaysCount = Math.min(maxLimit, reqDays);

        const individualDays: number[] = [];
        const nonIndividualCandidates: { day: number; score: number }[] = [];

        daysArray.forEach(day => {
          const dateKey = `${monthNum}月${day}日`;
          const att = mergedData.attendance[cId]?.[dateKey];
          const isAttending = !!(att && att.officeId === selectedOfficeId && !att.isAbsent && !att.isWaitlist);
          const report = mergedData.dailyReports[cId]?.[dateKey];
          const hasResult = !!(report?.content?.resultInfo?.trim());
          const hasFuture = !!(report?.content?.futurePlan?.trim() || mergedData.treeCommFutures[cId]?.[dateKey]?.trim());
          const hasTree = !!(report?.content?.externalInfo?.trim() || mergedData.treeCommTexts[cId]?.[dateKey]?.trim());

          const dObj = new Date(year, month - 1, day);
          const dayOfWeek = dObj.getDay();
          const isIndividual = summarySettings.individualDaysOfWeek.includes(dayOfWeek);

          // 除外週は個別療育日も含めて候補から外す。
          if (isAutoSelectCandidate(year, month, day, excludedWeeks, isAttending)) {
            if (isIndividual) {
              // 個別療育の日
              individualDays.push(day);
            } else {
              // 集団療育の日（療育結果・予定・通信等の入力状況でスコアリング）
              let score = 0;
              if (hasResult) score += 100;
              if (hasFuture) score += 30;
              if (hasTree) score += 10;
              if (isAttending) score += 20;

              nonIndividualCandidates.push({ day, score });
            }
          }
        });

        const candidates: AdoptionCandidate[] = [
          ...individualDays.map(day => ({ day, individual: true, score: 0 })),
          ...nonIndividualCandidates.map(candidate => ({ ...candidate, individual: false }))
        ];
        if (minimumGap !== undefined) {
          recordSelection(child, targetDaysCount, selectSpacedAdoptionDays([
            ...individualDays.map(day => ({ day, individual: true, score: 0 })),
            ...nonIndividualCandidates.map(candidate => ({ ...candidate, individual: false }))
          ], targetDaysCount, minimumGap), candidates);
          return;
        }

        // 1. 個別療育の日はすべて必ず採用（ただし最大上限6日）
        individualDays.sort((a, b) => a - b);
        const chosenIndividual = individualDays.slice(0, maxLimit);

        // 2. 残り採用可能枠を計算（上限 targetDaysCount から、採用した個別の分を差し引く）
        const remainingSlots = Math.max(0, targetDaysCount - chosenIndividual.length);

        // 3. 集団療育の候補から「可能な限り間を空けつつ」必要数（remainingSlots）を選択
        let chosenNonIndividual: number[] = [];

        if (remainingSlots > 0 && nonIndividualCandidates.length > 0) {
          if (nonIndividualCandidates.length <= remainingSlots) {
            // 候補数が枠数以下の場合はすべて採用
            chosenNonIndividual = nonIndividualCandidates.map(c => c.day);
          } else {
            // 候補日が多数ある場合、記入状況スコア上位16件に事前フィルタして組み合わせ爆発を防止
            const sortedByScore = [...nonIndividualCandidates].sort((a, b) => b.score - a.score);
            const searchPool = sortedByScore.length > 16
              ? sortedByScore.slice(0, 16).sort((a, b) => a.day - b.day)
              : [...nonIndividualCandidates].sort((a, b) => a.day - b.day);

            const candidateDayNumbers = searchPool.map(c => c.day);
            const combos = getCombinations(candidateDayNumbers, remainingSlots);

            let bestCombo: number[] = combos[0] || [];
            let bestScore = -Infinity;

            combos.forEach(combo => {
              // 個別療育の日と組み合わせた全選択日の間隔を評価
              const fullSelection = [...chosenIndividual, ...combo].sort((a, b) => a - b);

              let minGap = Infinity;
              let gapPenalty = 0;
              let logGapSum = 0;

              for (let i = 0; i < fullSelection.length - 1; i++) {
                const gap = fullSelection[i + 1] - fullSelection[i];
                if (gap < minGap) minGap = gap;

                if (gap === 1) {
                  gapPenalty += 30000; // 連日は超特大ペナルティ
                } else if (gap === 2) {
                  gapPenalty += 10000; // 中1日も特大ペナルティ
                } else if (gap === 3) {
                  gapPenalty += 3000;  // 中2日もペナルティ
                } else if (gap === 4) {
                  gapPenalty += 1000;
                }

                logGapSum += Math.log2(gap) * 150;
              }

              // 記録記入ボーナス（間隔が同程度に空いているなら、結果記入済みの日を優先）
              let recordScore = 0;
              combo.forEach(day => {
                const cand = nonIndividualCandidates.find(c => c.day === day);
                if (cand) recordScore += cand.score * 0.3;
              });

              // 総合評価:
              // - 最小間隔（minGap）が大きいこと（間が空いていること）を最優先（× 8000）
              // - 連日・近接ペナルティを減点
              // - 全体の間隔均等バランス加点
              // - 記録記入状況加点
              const score = (minGap * 8000) - gapPenalty + logGapSum + recordScore;

              if (score > bestScore) {
                bestScore = score;
                bestCombo = combo;
              }
            });

            chosenNonIndividual = bestCombo;
          }
        }

        // 4. 合計して Set に格納（個別療育日は必ず採用され、上限を超えた場合は集団療育が排除される）
        const finalChosen = [...chosenIndividual, ...chosenNonIndividual].sort((a, b) => a - b);
        recordSelection(child, targetDaysCount, finalChosen, candidates);
      });

      return { daysMap: newSelected, details };
  }, [childrenData, childAttendanceStats, daysArray, monthNum, mergedData, selectedOfficeId, year, month, summarySettings.individualDaysOfWeek, getCombinations, isAutoSelectOpen, isAutoSelectGapValid, isRelaxedGapValid, autoSelectExcludedWeeks, minimumAutoSelectGap, selectedDaysMap, shortagePolicy, relaxedGap]);

  // 選択内容を一括保存（選択マスを正式採用 archived: false、未選択の既存レポートを archived: true）
  const handleSaveAdoptions = async (nextSelected: Record<string, Set<number>>) => {
    if (adoptionSaveInFlight.current || isLoading || monthlyReadError) return;
    adoptionSaveInFlight.current = true;
    const scope = `${selectedOfficeId}_${currentMonth}`;
    setSelectedDaysMap(nextSelected);
    setAdoptionSaveError('');
    setIsSavingAdoptions(true);
    try {
      const reportUpdates: Record<string, Record<string, any>> = {};

      // writeBatch は1バッチ最大500件までのため、400件単位で分割管理
      let currentBatch = writeBatch(db);
      let opCount = 0;
      const batches: ReturnType<typeof writeBatch>[] = [currentBatch];

      const addOperation = (fn: (b: ReturnType<typeof writeBatch>) => void,cost=1) => {
        if (opCount+cost > 400) {
          currentBatch = writeBatch(db);
          batches.push(currentBatch);
          opCount = 0;
        }
        fn(currentBatch);
        opCount+=cost;
      };

      const pad = (n: number) => n.toString().padStart(2, '0');

      for (const child of childrenData) {
        if (!child.id) continue;
        const cId = child.id;
        const selectedDays = nextSelected[cId] || new Set<number>();
        const childDailyReports = mergedData.dailyReports[cId] || {};

        for (const day of daysArray) {
          const dateKey = `${monthNum}月${day}日`;
          const isSelected = selectedDays.has(day);
          if (isSelected === (savedSelectedDaysMap[cId]?.has(day) ?? false)) continue;
          if (!reportUpdates[cId]) reportUpdates[cId] = {};
          const existingReport = childDailyReports[dateKey];
          const formattedDate = `${year}-${pad(month)}-${pad(day)}`;

          if (isSelected) {
            // 正式採用対象
            if (existingReport && existingReport.id) {
              if (existingReport.archived === true) {
                const docRef = doc(db, 'daily_reports', existingReport.id);
                addOperation((b) => {
                  b.update(docRef, {
                    archived: false,
                    updatedAt: serverTimestamp()
                  });
                  appendDocumentAudit(b,{officeId:selectedOfficeId,book:'implementation',childId:cId,month:currentMonth,operation:'採用日変更'},[{date:dateKey,field:'採用日',action:'採用'}]);
                },2);
                reportUpdates[cId][dateKey] = { ...existingReport, archived: false };
              }
            } else {
              // 既存ドキュメントがないが正式採用として選択された日 -> 新規作成
              const newDocRef = doc(collection(db, 'daily_reports'));
              const treeText = mergedData.treeCommTexts[cId]?.[dateKey] || "";
              const treeFuture = mergedData.treeCommFutures[cId]?.[dateKey] || "";

              const payload = {
                childId: cId,
                planMonth: currentMonth,
                date: formattedDate,
                officeId: selectedOfficeId,
                staffId: "",
                staffName: loginStaffName || "",
                type: 'tree_report',
                content: {
                  externalInfo: treeText,
                  supportContent: [],
                  resultInfo: "",
                  futurePlan: treeFuture,
                  isVerified: false,
                },
                externalInfo: treeText,
                archived: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };

              addOperation((b) => {
                b.set(newDocRef, payload);
                appendDocumentAudit(b,{officeId:selectedOfficeId,book:'implementation',childId:cId,month:currentMonth,operation:'採用日変更'},[{date:dateKey,field:'採用日',action:'採用'}]);
              },2);
              reportUpdates[cId][dateKey] = { ...payload, ...payload.content, id: newDocRef.id };
            }
          } else {
            // 未選択（アーカイブ対象）
            if (existingReport && existingReport.id && existingReport.archived !== true) {
              const docRef = doc(db, 'daily_reports', existingReport.id);
              addOperation((b) => {
                b.update(docRef, {
                  archived: true,
                  updatedAt: serverTimestamp()
                });
                appendDocumentAudit(b,{officeId:selectedOfficeId,book:'implementation',childId:cId,month:currentMonth,operation:'採用日変更'},[{date:dateKey,field:'採用日',action:'解除'}]);
              },2);
              reportUpdates[cId][dateKey] = { ...existingReport, archived: true };
            }
          }
        }
      }

      for (const batch of batches) await batch.commit();
      if (adoptionScope.current === scope) {
        setSavedSelectedDaysMap(nextSelected);
        setMergedData(prev => {
          const dailyReports = { ...prev.dailyReports };
          for (const [childId, reports] of Object.entries(reportUpdates)) {
            dailyReports[childId] = { ...dailyReports[childId], ...reports };
          }
          return { ...prev, dailyReports };
        });
      }
    } catch (err: any) {
      console.error('Failed to save adoptions:', err);
      if (adoptionScope.current === scope) {
        setSelectedDaysMap(savedSelectedDaysMap);
        setAdoptionSaveError('採用日を保存できませんでした。通信状態を確認し、もう一度操作してください。');
        // 分割保存の途中で失敗した場合も、保存済みの状態に合わせる。
        void fetchData();
      }
    } finally {
      adoptionSaveInFlight.current = false;
      setIsSavingAdoptions(false);
    }
  };

  const handleAdoptFuturePlanDays = () => {
    if (adoptionSaveInFlight.current || isLoading) return;
    const nextSelected: Record<string, Set<number>> = {};
    for (const child of childrenData) {
      if (!child.id) continue;
      nextSelected[child.id] = new Set(daysArray.filter(day => {
        const cell = getCellDetails(child.id!, day);
        return cell.isAttending && cell.hasFuture;
      }));
    }
    setIsMonthlyTasksOpen(false);
    void handleSaveAdoptions(nextSelected);
  };

  const toggleDaySelection = (childId: string, day: number) => {
    if (adoptionSaveInFlight.current || isLoading) return;
    const days = new Set(selectedDaysMap[childId] || []);
    if (days.has(day)) days.delete(day); else days.add(day);
    void handleSaveAdoptions({ ...selectedDaysMap, [childId]: days });
  };

  const handleSaveSettings = async () => {
    if (implementationSettingsKey !== `${selectedOfficeId}_${currentMonth}` || isImplementationSettingsLoading) return;
    const { implementationYear: y, implementationMonth: m, implementationDay: d } = implementationDraft;
    if (y || m || d) {
      const date = new Date(Number(y) + 2018, Number(m) - 1, Number(d));
      if (!y || !m || !d || ![y,m,d].every(value => /^\d+$/.test(value)) || Number(y) < 1 || date.getFullYear() !== Number(y) + 2018 || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
        setSettingsTab('implementation');
        setImplementationTab('author');
        setImplementationSettingsError('作成日は有効な年月日をすべて入力するか、すべて空欄にしてください。');
        return;
      }
    }
    setImplementationSettingsError('');
    setIsSavingSettings(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'officeSummarySettings', selectedOfficeId), {
        holidayDaysOfWeek: tempSettings.holidayDaysOfWeek,
        individualDaysOfWeek: tempSettings.individualDaysOfWeek,
        addIndividualDays: tempSettings.addIndividualDays,
        hideZeroAttendance: tempSettings.hideZeroAttendance,
        holidayColor: tempSettings.holidayColor,
        individualColor: tempSettings.individualColor,
        hiddenCountRows: tempSettings.hiddenCountRows,
        focusHighlightEnabled: tempSettings.focusHighlightEnabled,
        staffDisplayMode: tempSettings.staffDisplayMode,
        tableOrientation: tempSettings.tableOrientation,
        updatedAt: serverTimestamp()
      }, { merge: true });

      batch.set(monthlySettingsRef(selectedOfficeId, currentMonth), {
        ...inheritedMonthlySettings, ...implementationDraft, officeId: selectedOfficeId, month: currentMonth, updatedAt: serverTimestamp()
      }, { merge: true });
      auditDocumentWrite(batch,{officeId:selectedOfficeId,book:'implementation',childId:'',month:currentMonth,label:'事業所共通の作成者・作成日',operation:'設定変更'},inheritedMonthlySettings,implementationDraft);
      await batch.commit();
      setSummarySettings({ ...tempSettings });
      setIsSettingsOpen(false);
    } catch (err) {
      console.error("Error saving summary settings:", err);
      alert("設定の保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (monthlyReadError) return <div role="alert" className="mx-auto mt-8 max-w-xl space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
    <h2 className="font-bold">実施状況を読み込めませんでした</h2><p className="text-sm leading-relaxed">{monthlyReadError}</p>
    <button type="button" disabled={isLoading} onClick={() => void fetchData()} className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm disabled:opacity-50">再試行</button>
  </div>;

  return (
    <div className="flex flex-col h-full gap-3">
      {mobileHeaderSlot&&createPortal(<div className="flex min-h-11 items-center gap-2 pb-2">
        <button type="button" aria-label="児童一覧に戻る" onClick={()=>navigate('/')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><ArrowLeft size={20}/></button>
        <h2 className="min-w-0 flex-1 text-sm font-bold text-slate-800">月間支援実施状況一覧</h2>
        <button type="button" aria-label="実施状況の設定" title="実施状況の設定" onClick={()=>{setSettingsTab('table');setImplementationTab('author');setIsSettingsOpen(true);}} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><SettingsIcon size={20}/></button>
      </div>,mobileHeaderSlot)}
      {/* 上部ヘッダー */}
      <div className="summary-desktop-header flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white px-5 py-3 rounded-2xl border border-slate-200/80 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
<h2 className="text-lg md:text-xl font-bold text-slate-800 mt-0.5 flex items-center gap-2">
              <Calendar size={20} className="text-primary" />
              月間支援実施状況一覧
            </h2>
          </div>
        </div>

        {/* 月切替コントロールとアクション */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative" onKeyDown={event => {
            if (event.key === 'Escape' && isMonthlyTasksOpen) {
              event.preventDefault(); setIsMonthlyTasksOpen(false);
              document.getElementById('monthly-tasks-trigger')?.focus();
            }
          }} onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setIsMonthlyTasksOpen(false);
          }}>
            <button id="monthly-tasks-trigger" type="button" aria-expanded={isMonthlyTasksOpen} aria-controls="monthly-tasks-panel"
              disabled={isLoading || isSavingAdoptions || childrenData.length === 0}
              onClick={() => { setIsMonthlyTasksOpen(prev => !prev); setIsLegendOpen(false); }}
              className="relative z-50 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Calendar size={17} className="text-primary" />月次作業<ChevronDown size={15} className={isMonthlyTasksOpen ? 'rotate-180' : ''} />
            </button>
            {isMonthlyTasksOpen && <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setIsMonthlyTasksOpen(false)} />
              <section id="monthly-tasks-panel" aria-label="月次作業" className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl sm:left-auto sm:right-0">
                <div className="px-3 pb-2 pt-2 text-xs font-semibold text-slate-400">月初</div>
                <div className="flex items-center rounded-xl">
                <button type="button" onClick={() => { setIsMonthlyTasksOpen(false); setIsAutoSelectOpen(true); }} className="group/task flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50"><Wand2 size={17} className="mt-0.5 shrink-0 text-primary" /><MonthlyTaskLabel title="採用日を自動選択" description="必要日数・日付の間隔・除外する週などを指定して、採用日をまとめて選びます。" /></button>
                  <div className="shrink-0 pr-2"><button type="button" onClick={() => { setIsMonthlyTasksOpen(false); void handleSaveAdoptions({}); }} aria-label="採用日を全解除" title="採用日を全解除" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><RotateCcw size={12} />全解除</button></div>
                </div>
                <div className="flex items-center rounded-xl">
                <button type="button" onClick={() => { setIsMonthlyTasksOpen(false); setIsDistributeModalOpen(true); }} className="group/task flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50"><Users size={17} className="mt-0.5 shrink-0 text-primary" /><MonthlyTaskLabel title="担当者を割り振り" description="記入数の偏りを抑えるように、児童の担当スタッフを割り振ります。" /></button>
                  <div className="shrink-0 pr-2"><button type="button" disabled={isSavingStaffAssignments || staffAssignmentLoadedScope !== `${selectedOfficeId}_${currentMonth}`} onClick={() => { setIsMonthlyTasksOpen(false); setStaffActionError(''); setIsClearStaffOpen(true); }} aria-label="スタッフの担当を全解除" title="スタッフの担当を全解除" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><RotateCcw size={12} />全解除</button></div>
                </div>
                <div className="mt-2 border-t border-slate-100 px-3 pb-2 pt-3 text-xs font-semibold text-slate-400">月末</div>
                <button type="button" onClick={handleAdoptFuturePlanDays} disabled={isLoading || isSavingAdoptions} className="group/task flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 disabled:opacity-50"><Check size={17} className="mt-0.5 shrink-0 text-primary" /><MonthlyTaskLabel title="◎の日だけ採用にする" description="今後の予定が入力されている日だけを、採用日にします。" /></button>
                <button type="button" onClick={() => { setIsMonthlyTasksOpen(false); setIsResultImportOpen(true); }} className="group/task flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50"><Sparkles size={17} className="mt-0.5 shrink-0 text-primary" /><MonthlyTaskLabel title="療育結果を作成・一括登録" description="プロンプト・ツリー通信のコピーから、結果の貼り付け・確認・登録までをこの画面で行います。" /></button>
                <button type="button" onClick={()=>{setIsMonthlyTasksOpen(false);setSettingsTab('implementation');setImplementationTab('author');setIsSettingsOpen(true);}} className="group/task flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50"><SettingsIcon size={17} className="mt-0.5 shrink-0 text-primary"/><MonthlyTaskLabel title="作成者・作成日の設定" description="今月の専門的支援実施計画に使う作成者名と作成日を確認・設定します。"/></button>
              </section>
            </>}
          </div>
          <button type="button" disabled={isLoading || staffAssignmentLoadedScope !== `${selectedOfficeId}_${currentMonth}`} onClick={() => setIsStaffSummaryOpen(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Users size={17} />スタッフ別の記入数</button>
          <button type="button" aria-label="変更ログ" title="変更ログ" onClick={()=>setIsDocumentLogOpen(true)} className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"><Clock size={20}/></button>
          <button type="button" disabled={isLoading || childrenData.length === 0} onClick={()=>{const table=document.getElementById('monthly-summary-table');if(table instanceof HTMLTableElement)setPrintSource(table.cloneNode(true) as HTMLTableElement);}} className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-50" aria-label="表を印刷" title="印刷設定を開きます">
            <Printer size={20} />
          </button>
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2.5">
            {/* 凡例「？」アイコンボタン & ポップオーバー */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsLegendOpen(prev => !prev)}
                className={`p-2 border rounded-xl transition-all flex items-center justify-center ${
                  isLegendOpen 
                    ? 'bg-primary text-white border-primary shadow-xs' 
                    : 'hover:bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
                title="表の凡例・記号説明を表示"
              >
                <HelpCircle size={20} />
              </button>

              {isLegendOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsLegendOpen(false)} 
                  />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200 text-xs text-slate-700 w-80 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                    <div className="font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="flex items-center gap-1.5 text-sm">
                        <Info size={16} className="text-primary" /> 表の凡例・記号説明
                      </span>
                      <button 
                        onClick={() => setIsLegendOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 flex items-center justify-center ring-2 ring-inset ring-emerald-600 shrink-0" />
                        <span>緑枠：個別の採用日（今後の予定を入れる日）</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 flex items-center justify-center shrink-0">〇</span>
                        <span>出席予定あり（今後の予定は未記入）</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 flex items-center justify-center text-green-600 font-bold shrink-0">◎</span>
                        <span>今後の予定あり</span>
                      </div>
                      <p className="text-slate-500">緑枠は採用日です。記号は出席予定・今後の予定の有無を表します。</p>
                      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-100">
                        <span 
                          className="w-5 h-5 rounded border border-slate-300 shrink-0" 
                          style={{ backgroundColor: summarySettings.holidayColor }}
                        />
                        <span>休みの日 (非稼働日)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-5 h-5 rounded border border-slate-300 shrink-0" 
                          style={{ backgroundColor: summarySettings.individualColor }}
                        />
                        <span>個別療育の日</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                        <div className="font-bold text-slate-700">【必要日数の計算基準】</div>
                        <div>・放課後デイ: 出席12日以上で6日 / 6〜11日で4日 / 5日以下で2日</div>
                        <div>・児童発達支援: 出席12日以上で6回 / 12日未満で4回</div>
                        <div>・個別療育: {summarySettings.addIndividualDays?'基準日数に上乗せ（最大6日）':'必要日数に含める'}</div>
                        <div>・個別療育・集団療育: それぞれの実際の出席日数</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <button
              onClick={() => { setSettingsTab('table'); setImplementationTab('author'); setIsSettingsOpen(true); }}
              aria-label="実施状況の設定"
              className="shrink-0 p-2 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition-all hover:border-slate-300 flex items-center justify-center"
              title="実施状況の設定"
            >
              <SettingsIcon size={20} />
            </button>
              <HeaderAccountActions />
            </div>

        </div>
      </div>

      {orderPreferenceError&&<p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{orderPreferenceError}</p>}
      {adoptionSaveError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-xs text-rose-700">{adoptionSaveError}</p>}

      {/* 列幅を保ち、収まらない場合は表の中で横スクロール */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {staffAssignmentLoadError&&<p role="alert" className="px-3 py-2 text-xs text-rose-600">{staffAssignmentLoadError}<button type="button" onClick={()=>setStaffAssignmentReload(value=>value+1)} className="ml-3 min-h-10 rounded-xl border px-3">担当を再読み込み</button></p>}
        {isLoading||(effectiveStaffFilter!=='all'&&!staffFilterReady&&!staffAssignmentLoadError) ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-slate-400">データを読み込み中...</p>
          </div>
        ) : sortedChildren.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm font-semibold text-slate-600">表示対象の児童がいません</p>
            <DropdownSelect label="児童の並べ替え・表示" value={childOrder} onChange={setChildOrder} options={SUMMARY_ORDER_OPTIONS} toggles={assignedOnlyToggles} icon={<ArrowDownUp size={18}/>}/>
            <p className="text-xs text-slate-400">{staffFilter==='mine'&&!ownStaffId?'ログイン中のスタッフに一致する担当者が見つかりません。':summarySettings.hideZeroAttendance?'出席日数0日の非表示設定、または担当の表示条件をご確認ください。':'事業所の所属児童、または担当の表示条件をご確認ください。'}</p>
          </div>
        ) : (
          <div className="flex-1 min-w-0 overflow-auto bg-white">
            <SummaryTableLayout orientation={summarySettings.tableOrientation}>
            <table id="monthly-summary-table"
              className="border-separate border-spacing-0 table-fixed"
              style={{ width: 80 + sortedChildren.length * 40 }}
              onMouseLeave={() => {
                setHoveredColChildId(null);
                setHoveredRowDay(null);
              }}
            >
              <colgroup>
                <col style={{ width: 80 }} />
                {sortedChildren.map(child => <col key={child.id} style={{ width: 40 }} />)}
              </colgroup>
              <thead>
                {/* 1行目: 児童氏名 */}
                <tr>
                  <th 
                    className="px-2 py-2 text-center align-middle text-xs font-bold text-slate-600 tracking-wider border-r border-b border-slate-200 sticky top-0 left-0 z-30 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]"
                    style={{ height: '116px', backgroundColor: '#f1f5f9' }}
                  >
                    <div className={summarySettings.tableOrientation==='children-rows'?'flex items-center justify-center gap-0.5':'flex flex-col items-center justify-center gap-1'}>
                      <MonthPicker value={currentMonth} onChange={setCurrentMonth}/>
                      <span data-print-exclude>
                        <DropdownSelect label="児童氏名の並べ替え" icon={<ArrowDownUp size={18}/>} iconOnly value={childOrder} onChange={setChildOrder} options={SUMMARY_ORDER_OPTIONS} toggles={assignedOnlyToggles}/>
                      </span>
                    </div>
                  </th>
                  {sortedChildren.map((child, columnIndex) => {
                    const isColHovered = isFocusHighlightEnabled && child.id === hoveredColChildId;
                    return (
                      <th
                        data-even-column={columnIndex % 2 === 1}
                        key={child.id}
                        data-print-child-id={child.id}
                        className={`px-2 py-2 border-r border-b border-slate-200 text-center align-middle sticky top-0 z-20 transition-colors duration-150 ${
                          isColHovered ? '!bg-blue-100/90 shadow-md ring-2 ring-inset ring-blue-400' : ''
                        }`}
                        data-print-background="#ffffff"
                        style={{ height: '110px', backgroundColor: isColHovered ? '#dbeafe' : '#ffffff' }}
                        title={child.fullName}
                        onMouseEnter={() => isFocusHighlightEnabled && setHoveredColChildId(child.id || null)}
                        onMouseLeave={() => isFocusHighlightEnabled && setHoveredColChildId(null)}
                      >
                        {completedChildren.scope===selectedOfficeId+'_'+currentMonth&&completedChildren.ids.has(child.id!)&&<span role="img" aria-label="今月の専門的支援実施計画は完了" title="今月の専門的支援実施計画は完了" data-print-exclude className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white print:hidden"><Check size={14} strokeWidth={3}/></span>}
                        <div 
                          className={`inline-block text-xs font-bold leading-none transition-colors duration-150 ${
                            isColHovered ? 'text-blue-950 font-black scale-105' : 'text-slate-700'
                          }`}
                          style={{ 
                            writingMode: 'vertical-rl', 
                            textOrientation: 'upright', 
                            whiteSpace: 'nowrap',
                            margin: '0 auto'
                          }}
                        >
                          <ChildDocumentMenu childId={child.id!} name={child.fullName} month={currentMonth} />
                        </div>
                      </th>
                    );
                  })}
                </tr>

                {/* 2行目: 担当スタッフ（新設） */}
                <tr>
                  <th 
                    className="w-20 px-2 py-1 text-center align-middle text-[11px] font-bold text-indigo-900 tracking-wider border-r border-b border-slate-200 sticky top-[110px] left-0 z-30 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]"
                    style={{ height: '34px', backgroundColor: '#e0e7ff' }}
                  >
                    担当スタッフ
                  </th>
                  {sortedChildren.map((child, columnIndex) => {
                    if (!child.id) return <th data-even-column={columnIndex % 2 === 1} key={Math.random()} className="border-r border-b border-slate-200" />;
                    const staffId = assignedStaffMap[child.id];
                    const assignedStaff = staffList.find(s => s.id === staffId);
                    const isColHovered = isFocusHighlightEnabled && child.id === hoveredColChildId;
                    const isEditing = staffPopoverAnchor?.childId === child.id;

                    return (
                      <th
                        data-even-column={columnIndex % 2 === 1}
                        key={`staff-${child.id}`}
                        className={`px-1 py-0.5 border-r border-b border-slate-200 text-center align-middle sticky top-[110px] z-20 text-xs font-bold select-none transition-colors duration-150 relative ${
                          isColHovered ? '!bg-indigo-50 text-indigo-900 border-x-blue-300' : 'text-slate-800'
                        }`}
                        data-print-background="#f8fafc"
                        style={{ height: '34px', backgroundColor: isColHovered ? '#e0e7ff' : '#f8fafc' }}
                        onMouseEnter={() => isFocusHighlightEnabled && setHoveredColChildId(child.id || null)}
                        onMouseLeave={() => isFocusHighlightEnabled && setHoveredColChildId(null)}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (staffPopoverAnchor?.childId === child.id) {
                              setStaffPopoverAnchor(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setStaffPopoverAnchor({
                                childId: child.id!,
                                x: rect.left + rect.width / 2,
                                y: rect.bottom + 4,
                              });
                            }
                          }}
                          className={`w-full flex items-center justify-center gap-1 py-1 px-1 rounded-md transition-colors ${
                            isEditing ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'hover:bg-slate-200/60'
                          }`}
                          aria-label={assignedStaff ? `担当スタッフ：${assignedStaff.name}を変更` : '担当スタッフを設定'}
                          title={assignedStaff ? `担当スタッフ: ${assignedStaff.name} (クリックして変更)` : '担当スタッフ未設定 (クリックして設定)'}
                        >
                          {summarySettings.staffDisplayMode !== 'name' && (
                            <span data-staff-icon aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full shadow-2xs" style={{ display: 'inline-block', backgroundColor: assignedStaff?.color || '#cbd5e1' }} />
                          )}
                          {summarySettings.staffDisplayMode !== 'icon' && (
                            <span className="min-w-0 truncate text-[10px] font-bold text-slate-800">{assignedStaff?.name.split(/[\s　]+/)[0] || '未設定'}</span>
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>

                {countRowLabels.map((label,index)=>!hiddenCountRows.includes(label)&&<tr key={label}>
                  <th className="w-20 sticky left-0 z-30 border-r border-b border-slate-200 px-2 py-1 text-center text-xs font-bold text-slate-700" style={{top:countRowTop(index),height:28,backgroundColor:label==='個別療育'?summarySettings.individualColor:label==='集団療育'?'#d1fae5':'#f1f5f9'}}>{label}</th>
                  {sortedChildren.map((child,columnIndex)=>{const value=summaryCountValue(label,child.id?childAttendanceStats[child.id]:null),hovered=isFocusHighlightEnabled&&child.id===hoveredColChildId;const background=label==='個別療育'?summarySettings.individualColor:label==='集団療育'?'#ecfdf5':label==='必要日数'?'#eff6ff':'#ffffff';return <th key={label+'-'+child.id} data-even-column={columnIndex%2===1} data-print-background={background} className="sticky z-20 select-none border-r border-b border-slate-200 px-2 py-0.5 text-center text-xs font-bold text-slate-800" style={{top:countRowTop(index),height:28,backgroundColor:hovered?'#dbeafe':background}} title={child.fullName+'の'+label+'：'+value+'日'} onMouseEnter={()=>isFocusHighlightEnabled&&setHoveredColChildId(child.id||null)} onMouseLeave={()=>isFocusHighlightEnabled&&setHoveredColChildId(null)}>{value}</th>;})}
                </tr>)}

                {/* 6行目: 採用選択 */}
                <tr>
                  <th 
                    className="w-20 px-2 py-1 text-center align-middle text-[11px] font-bold text-amber-900 tracking-wider border-r border-b border-slate-200 sticky left-0 z-30 shadow-[2px_2px_4px_-1px_rgba(0,0,0,0.06)]"
                    style={{ top: countRowTop(countRowLabels.length), height: '30px', backgroundColor: '#fef3c7' }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>採用数</span>
                    </div>
                  </th>
                  {sortedChildren.map((child, columnIndex) => {
                    const stat = child.id ? childAttendanceStats[child.id] : null;
                    const targetCount = Math.min(6, stat?.requiredDays ?? 0);
                    const selectedCount = (child.id && selectedDaysMap[child.id]) 
                      ? Array.from(selectedDaysMap[child.id]).filter(day => {
                          const dateKey = `${monthNum}月${day}日`;
                          const att = mergedData.attendance[child.id!]?.[dateKey];
                          return !!(att && att.officeId === selectedOfficeId && !att.isAbsent && !att.isWaitlist);
                        }).length
                      : 0;
                    const isMatch = targetCount > 0 && selectedCount === targetCount;
                    const isOver = selectedCount > targetCount;
                    const isColHovered = isFocusHighlightEnabled && child.id === hoveredColChildId;

                    return (
                      <th
                        data-even-column={columnIndex % 2 === 1}
                        key={`adp-count-${child.id}`}
                        className={`px-1 py-0.5 border-r border-b border-slate-200 text-center align-middle sticky z-20 text-xs font-bold select-none shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)] transition-colors duration-150 ${
                          isColHovered ? '!bg-amber-100/90 ring-1 ring-amber-300' : ''
                        }`}
                        data-print-background="#ffffff"
                        style={{ top: countRowTop(countRowLabels.length), height: '30px', backgroundColor: isColHovered ? '#fef3c7' : '#ffffff' }}
                        title={`${child.fullName} の正式採用選択数: ${selectedCount}日 / 目標: ${targetCount}日 (最大6日)`}
                        onMouseEnter={() => isFocusHighlightEnabled && setHoveredColChildId(child.id || null)}
                        onMouseLeave={() => isFocusHighlightEnabled && setHoveredColChildId(null)}
                      >
                        <div className="flex items-center justify-center">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-colors ${
                            isMatch 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : isOver 
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : selectedCount > 0 
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'text-slate-400 font-normal'
                          }`}>
                            
                            {selectedCount}/{targetCount}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {daysArray.map(day => {
                  const { dayStr, className: dayColorClass } = getDayOfWeekDetails(day);
                  const dObj = new Date(year, month - 1, day);
                  const dayOfWeek = dObj.getDay();
                  const isHoliday = summarySettings.holidayDaysOfWeek.includes(dayOfWeek);
                  const isIndividual = summarySettings.individualDaysOfWeek.includes(dayOfWeek);
                  const isRowHovered = isFocusHighlightEnabled && day === hoveredRowDay;

                  let cellStyle: React.CSSProperties | undefined = undefined;
                  if (isHoliday) {
                    cellStyle = { backgroundColor: summarySettings.holidayColor };
                  } else if (isIndividual) {
                    cellStyle = { backgroundColor: summarySettings.individualColor };
                  }

                  return (
                    <tr key={day} className="transition-colors">
                      {/* 左端の日付セル (横スクロール固定: z-10、ホバー時点灯) */}
                      <td 
                        className={`px-3 py-2 border-r border-b border-slate-200 font-semibold text-xs text-center sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] transition-all duration-150 ${dayColorClass} ${
                          isRowHovered 
                            ? '!bg-blue-100/95 text-blue-950 font-black shadow-[2px_0_8px_-1px_rgba(37,99,235,0.3)] ring-1 ring-inset ring-blue-300' 
                            : 'bg-white'
                        }`}
                        style={!isRowHovered && (isHoliday ? { backgroundColor: summarySettings.holidayColor } : isIndividual ? { backgroundColor: summarySettings.individualColor } : undefined) || undefined}
                        onMouseEnter={() => isFocusHighlightEnabled && setHoveredRowDay(day)}
                        onMouseLeave={() => isFocusHighlightEnabled && setHoveredRowDay(null)}
                      >
                        {day}日 ({dayStr})
                      </td>
                      
                      {/* 児童ごとのステータスセル */}
                      {sortedChildren.map((child, columnIndex) => {
                        if (!child.id) return <td key={Math.random()} className="p-0 border-r border-b border-slate-200 text-center relative z-0" />;
                        const cellInfo = getCellDetails(child.id, day);
                        // 出席予定日のみ採用選択可能（非出席・欠席日に採用マークが出るのを完全に防止）
                        const isSelected = cellInfo.isAttending && (selectedDaysMap[child.id]?.has(day) ?? false);
                        const isColHovered = isFocusHighlightEnabled && child.id === hoveredColChildId;
                        const isCellHovered = isColHovered && isRowHovered;

                        return (
                          <td 
                            key={child.id}
                            data-adopted={isSelected}
                            data-even-column={columnIndex % 2 === 1}
                            className={`p-0 border-r border-b border-slate-200 text-center relative ${
                              isCellHovered ? 'z-20' : isColHovered ? 'z-10' : 'z-0'
                            } ${
                              cellInfo.isAttending ? 'cursor-pointer select-none' : ''
                            }`}
                            title={cellInfo.isAttending ? 'クリックで採用日の設定・解除（自動保存）' : undefined}
                            onMouseEnter={() => handleCellMouseEnter(child, day)}
                            onMouseLeave={handleCellMouseLeave}
                          >
                            {/* 列・行・セルのホバーハイライトオーバーレイ（フォーカスON時のみ表示） */}
                            {isFocusHighlightEnabled && isCellHovered ? (
                              <div data-print-exclude className="absolute inset-0 pointer-events-none bg-blue-500/[0.14] ring-2 ring-inset ring-blue-500 shadow-xs z-20" />
                            ) : isFocusHighlightEnabled && isColHovered ? (
                              <div data-print-exclude className="absolute inset-0 pointer-events-none bg-blue-500/[0.07] border-x border-blue-400/30 z-10" />
                            ) : isFocusHighlightEnabled && isRowHovered ? (
                              <div data-print-exclude className="absolute inset-0 pointer-events-none bg-blue-500/[0.04] z-10" />
                            ) : null}

                              <button type="button"
                                disabled={!cellInfo.isAttending || isSavingAdoptions || isLoading}
                                aria-pressed={isSelected}
                                aria-label={`${child.fullName} ${day}日 ${isSelected ? '採用日を解除' : '採用日にする'}`}
                                onClick={() => toggleDaySelection(child.id!, day)}
                                className={`w-full h-10 flex items-center justify-center text-sm transition-all duration-150 relative focus-visible:outline-2 focus-visible:outline-emerald-700 ${cellInfo.className} ${isSelected ? 'ring-2 ring-inset ring-emerald-600 bg-emerald-50/40 text-emerald-950 font-bold' : ''}`}
                                style={!isSelected ? cellStyle : undefined}
                              >{cellInfo.content}</button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </SummaryTableLayout>
          </div>
        )}
      </div>

      {/* 担当スタッフ変更ポップオーバー（createPortalにより最前面 z-[9999] に表示） */}
      {staffPopoverAnchor && createPortal(
        <>
          {/* 背景クリックで閉じる透明オーバーレイ */}
          <div 
            className="fixed inset-0 z-[9998] cursor-default bg-black/5" 
            onClick={(e) => {
              e.stopPropagation();
              setStaffPopoverAnchor(null);
            }} 
          />
          <div 
            className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-slate-250 p-2.5 min-w-[170px] max-w-[240px] text-left animate-in fade-in zoom-in-95 duration-100 ring-1 ring-slate-900/10"
            style={{
              left: `${Math.min(window.innerWidth - 185, Math.max(12, staffPopoverAnchor.x - 85))}px`,
              top: `${Math.min(window.innerHeight - 280, staffPopoverAnchor.y)}px`,
            }}
          >
            <div className="text-[11px] font-bold text-slate-700 px-2 py-1 border-b border-slate-100 mb-1.5 flex items-center justify-between">
              <span>担当スタッフ変更</span>
              <button
                type="button"
                onClick={() => {
                  setStaffPopoverAnchor(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-100"
              >
                <X size={13} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                updateStaffAssignment(staffPopoverAnchor.childId, null);
                setStaffPopoverAnchor(null);
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1.5 transition-colors mb-1 font-medium"
            >
              <span>✕</span>
              <span>未割当に戻す</span>
            </button>
            <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
              {staffList.map(st => {
                const isSelected = assignedStaffMap[staffPopoverAnchor.childId] === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      updateStaffAssignment(staffPopoverAnchor.childId, st.id);
                      setStaffPopoverAnchor(null);
                    }}
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-slate-100/80 rounded-lg flex items-center gap-2 transition-colors ${
                      isSelected ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200/60' : 'text-slate-700'
                    }`}
                  >
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" 
                      style={{ backgroundColor: st.color }} 
                    />
                    <span className="truncate flex-1">{st.name}</span>
                    {isSelected && <span className="text-indigo-600 text-[11px] font-extrabold ml-1">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {isStaffSummaryOpen && (
        <ViewportModal className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onKeyDown={event => { if (event.key === 'Escape') setIsStaffSummaryOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="staff-writing-title" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 id="staff-writing-title" className="font-bold text-slate-800">スタッフ別の記入数</h3>
              <button autoFocus type="button" aria-label="記入数一覧を閉じる" onClick={() => setIsStaffSummaryOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto p-5">
              <p className="mb-1 text-sm font-semibold text-slate-700">{officeName}　{year}年{month}月分</p>
              <p className="mb-4 text-xs text-slate-500">担当児童の必要日数の合計（個別療育分を除く）</p>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-left">スタッフ</th><th className="px-3 py-2 text-right">児童数</th><th className="px-3 py-2 text-right">記入数</th></tr></thead>
                <tbody>{staffWritingRows.map(staff => <tr key={staff.id} className={`border-t border-slate-100 ${!staff.id ? 'bg-amber-50' : ''}`}>
                  <th className="px-3 py-3 text-left font-medium"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{backgroundColor: staff.color}} />{staff.name}</th>
                  <td className="px-3 py-3 text-right tabular-nums">{staff.childCount}名</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{staff.days}日分</td>
                </tr>)}</tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold"><tr><th className="px-3 py-3 text-left">合計</th><td className="px-3 py-3 text-right">{staffWritingRows.reduce((sum, row) => sum + row.childCount, 0)}名</td><td className="px-3 py-3 text-right">{staffWritingRows.reduce((sum, row) => sum + row.days, 0)}日分</td></tr></tfoot>
              </table>
            </div>
          </section>
        </ViewportModal>
      )}

      {isClearStaffOpen && (
        <ViewportModal className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onKeyDown={event => { if (event.key === 'Escape' && !isSavingStaffAssignments) setIsClearStaffOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="clear-staff-title" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <h3 id="clear-staff-title" className="border-b border-slate-100 px-5 py-4 font-bold text-slate-800">スタッフの担当を全解除</h3>
            <div className="space-y-3 p-5 text-sm text-slate-700">
              <p>{officeName}・{year}年{month}月分のスタッフの担当をすべて解除します。</p>
              {staffActionError && <p role="alert" className="text-rose-600">{staffActionError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button autoFocus type="button" disabled={isSavingStaffAssignments} onClick={() => setIsClearStaffOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 disabled:opacity-50">キャンセル</button>
              <button type="button" disabled={isSavingStaffAssignments} onClick={() => void handleClearStaffAssignments()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSavingStaffAssignments ? '解除中…' : '全解除する'}</button>
            </div>
          </section>
        </ViewportModal>
      )}

      {isDocumentLogOpen&&<DocumentChangeLog officeId={selectedOfficeId} childrenData={allChildrenData} onClose={()=>setIsDocumentLogOpen(false)}/>}
      {batchPrintTargets&&<BatchSupportPrint key={selectedOfficeId+'_'+currentMonth} targets={batchPrintTargets} officeId={selectedOfficeId} officeName={officeName} month={currentMonth} creator={loginStaffName} onClose={()=>setBatchPrintTargets(null)}/>}
      {printSource&&!batchPrintTargets&&<SummaryPrintSettings table={printSource} options={{...printSettings,year,month,
        zeroAttendanceChildIds:childrenData.filter(child=>child.id&&(childAttendanceStats[child.id]?.attendanceCount??0)===0).map(child=>child.id!)}}
        supportChildCount={summarySupportPrintTargets(orderedChildren,selectedDaysMap,mergedData.dailyReports,mergedData.attendance,mergedData.treeCommFutures,selectedOfficeId,currentMonth).length}
        onPrintSupport={()=>setBatchPrintTargets(summarySupportPrintTargets(orderedChildren,selectedDaysMap,mergedData.dailyReports,mergedData.attendance,mergedData.treeCommFutures,selectedOfficeId,currentMonth))}
        onChange={next=>setPrintSettings({orientation:next.orientation,alignment:next.alignment,stripeEvenColumns:next.stripeEvenColumns,repeatDateMiddle:next.repeatDateMiddle,repeatDateRight:next.repeatDateRight,excludeZeroAttendance:next.excludeZeroAttendance,fontSize:next.fontSize,nameFontSize:next.nameFontSize})}
        onClose={()=>setPrintSource(null)}/>}

      {isAutoSelectOpen && (
        <ViewportModal className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="auto-select-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 id="auto-select-title" className="flex items-center gap-2 text-base font-bold text-slate-800"><Wand2 size={18} />採用日を自動選択</h3>
              <button type="button" aria-label="自動選択を閉じる" onClick={() => setIsAutoSelectOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="space-y-4 overflow-y-auto p-6">
              <p className="text-sm font-semibold text-slate-700">{year}年{month}月：含めない週を選択</p>
              <p className="text-xs leading-relaxed text-slate-500">日曜始まりで、月の1日を含む週が第1週です。チェックした週は個別療育日も含めて除外します。</p>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map(week => (
                  <label key={week} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                    <input type="checkbox" checked={autoSelectExcludedWeeks.includes(week)}
                      onChange={e => setAutoSelectExcludedWeeks(prev => e.target.checked ? [...prev, week] : prev.filter(item => item !== week))}
                      className="h-4 w-4 accent-green-600" />第{week}週
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  採用日の間隔
                  <input type="number" min="1" max="31" step="1" value={autoSelectGap} aria-label="採用日の間隔（日）" aria-invalid={!isAutoSelectGapValid}
                    onChange={e => setAutoSelectGap(e.target.value)} placeholder="自動"
                    className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-base font-normal" />日以上
                </label>
                <p className="text-xs leading-relaxed text-slate-500">例：3日なら1日の次は4日以降。空欄は従来どおり自動で間隔を調整します。</p>
                <p className="text-xs leading-relaxed text-slate-500">指定した間隔は個別療育日にも適用します。必要日数に届かない場合の対応は下で選択できます。</p>
                {!isAutoSelectGapValid && <p role="alert" className="text-xs text-red-600">1〜31日の整数で入力してください。</p>}
              </div>
              <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-bold text-slate-700">必要日数まで選べない場合</legend>
                {([
                  ['partial', '条件を守って選べる分だけ採用する'],
                  ['relax-gap', '間隔を1日ずつ緩めて不足分を補う'],
                  ['allow-consecutive', '不足する場合だけ、連日の採用を許可する'],
                  ['keep', '不足する児童の採用日は変更しない']
                ] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input type="radio" name="adoption-shortage" value={value} checked={shortagePolicy === value} onChange={() => setShortagePolicy(value)} className="mt-0.5 accent-green-600" />{label}
                </label>)}
                {shortagePolicy === 'allow-consecutive' && <p className="text-xs leading-relaxed text-slate-500">まず連日にならない範囲で補い、それでも足りないときだけ連日を許可します。連日の組数をできるだけ少なくし、その範囲で個別療育日を優先します。</p>}
                {shortagePolicy === 'relax-gap' && <label className="flex items-center gap-2 text-sm text-slate-700">補うときの最小間隔
                  <input type="number" min="1" max={minimumAutoSelectGap ?? 1} step="1" aria-label="補うときの最小間隔（日）" aria-invalid={!isRelaxedGapValid} value={relaxedGap} onChange={e => setRelaxedGap(e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1" />日
                </label>}
                {!isRelaxedGapValid && <p role="alert" className="text-xs text-red-600">最小間隔は1日から指定した間隔までの整数で入力してください。間隔が空欄の場合は1日です。</p>}
                <p className="text-xs text-slate-500">除外した週・欠席・キャンセル待ちは補充に使いません。緩めても不足する場合は選べる分だけ採用します。「変更しない」では既存の採用日をそのまま残します。</p>
              </fieldset>
              {autoSelectionPreview && <section aria-label="自動選択の事前確認" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <h4 className="text-sm font-semibold text-slate-800">条件内で不足する児童：{autoSelectionPreview.details.length}名</h4>
                {autoSelectionPreview.details.length > 0 ? <div tabIndex={0} role="region" aria-label="児童ごとの採用日数の比較" className="max-h-56 overflow-auto rounded-lg border border-amber-200 bg-white focus-visible:outline-2 focus-visible:outline-emerald-600">
                  <table className="w-full border-collapse text-xs text-slate-700">
                    <caption className="sr-only">自動選択の事前確認：日数は反映前の見込みです</caption>
                    <thead className="sticky top-0 z-10 bg-amber-100 text-slate-600">
                      <tr>
                        <th scope="col" className="px-3 py-2.5 text-left font-semibold">児童名</th>
                        <th scope="col" className="px-2 py-2.5 text-center font-semibold">必要採用数</th>
                        <th scope="col" className="px-2 py-2.5 text-center font-semibold">採用不足数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {autoSelectionPreview.details.map(detail => <tr key={detail.id} className="border-t border-amber-100 even:bg-slate-50">
                        <th scope="row" className="px-3 py-2.5 text-left font-medium">{detail.name}</th>
                        <td className="px-2 py-2.5 text-center tabular-nums">{detail.target}日</td>
                        <td className={`px-2 py-2.5 text-center font-semibold tabular-nums ${detail.selected < detail.target ? 'text-rose-600' : 'text-emerald-700'}`}>{Math.max(0, detail.target - detail.selected)}日</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div> : <p className="text-xs text-slate-600">全児童で目標日数まで選択できます。</p>}
              </section>}
              <p className="text-xs leading-relaxed text-slate-500">「反映」で下の方針を適用し、採用日を自動保存します。</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button type="button" onClick={() => setIsAutoSelectOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">キャンセル</button>
              <button type="button" disabled={isLoading || isSavingAdoptions || !autoSelectionPreview} onClick={() => { if (!autoSelectionPreview) return; void handleSaveAdoptions(autoSelectionPreview.daysMap); setIsAutoSelectOpen(false); }} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check size={16} />反映</button>
            </div>
          </section>
        </ViewportModal>
      )}

      {/* 必要日数均等分配モーダル */}
      {isDistributeModalOpen && (
        <ViewportModal className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">担当者を割り振り</h3>
                  <p className="text-xs text-slate-500">専門的を書く日数を均等に割り振ります</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDistributeModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* 不可分ルールの説明バナー */}
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-950">
                  <Info size={14} className="text-blue-600 shrink-0" />
                  割り振りの基準
                </div>
                <p className="leading-relaxed text-[11px] text-blue-800">
                  記入日数の差を2日以内に収めつつ、前月と同じ児童の担当が続かないように割り振ります。児童ごとの担当は1人にまとめます。
                </p>
              </div>

              {staffAssignmentLoadError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                {staffAssignmentLoadError}<button type="button" onClick={() => setStaffAssignmentReload(value => value + 1)} className="shrink-0 rounded-lg border border-rose-200 px-3 py-2">再読み込み</button>
              </div> : staffAssignmentLoadedScope !== `${selectedOfficeId}_${currentMonth}` && <p className="text-xs text-slate-500">前月の担当を読み込み中…</p>}
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                個別療育の日を記入数に含めない
                <input type="checkbox" checked={excludeIndividualWritingDays}
                  disabled={staffAssignmentLoadedScope !== `${selectedOfficeId}_${currentMonth}` || isSavingStaffAssignments}
                  onChange={event => setExcludeIndividualWritingDays(event.target.checked)}
                  className="h-4 w-4 shrink-0 accent-indigo-600" />
              </label>
              {/* オプション: 表の並び順で近接児童をまとめる */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-200/70 rounded-xl">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={groupAdjacentColumns}
                    onChange={(e) => setGroupAdjacentColumns(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer mt-0.5"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-indigo-950">表の並び順（列）で近くの児童をなるべくまとめる（オプション）</span>
                    <p className="text-[11px] text-indigo-800/80 mt-0.5 leading-relaxed">
                      日数の差が2日以内の範囲で、表の近い児童を優先してまとめます。
                    </p>
                  </div>
                </label>
              </div>

              {/* スタッフ選択セクション */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">
                    分配対象スタッフの選択 ({selectedStaffForDist.size}/{staffList.length}名)
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedStaffForDist(new Set(staffList.map(s => s.id)))}
                      className="text-primary hover:underline font-semibold"
                    >
                      全員選択
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStaffForDist(new Set())}
                      className="text-slate-500 hover:underline"
                    >
                      全解除
                    </button>
                  </div>
                </div>

                {staffList.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center border border-dashed rounded-xl">
                    所属スタッフが見つかりません。
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {staffList.map(st => {
                      const isChecked = selectedStaffForDist.has(st.id);
                      const assignedChildren = childrenData.filter(c => c.id && assignedStaffMap[c.id] === st.id);
                      const currentDays = assignedChildren.reduce((sum, c) => sum + (c.id ? (childWritingDays[c.id] ?? 0) : 0), 0);

                      return (
                        <label
                          key={st.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isChecked 
                              ? 'bg-blue-50/40 border-blue-300 text-slate-800' 
                              : 'bg-slate-50/50 border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(selectedStaffForDist);
                                if (e.target.checked) next.add(st.id);
                                else next.delete(st.id);
                                setSelectedStaffForDist(next);
                              }}
                              className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                            />
                            <span className="w-3 h-3 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: st.color }} />
                            <span className="text-xs font-bold text-slate-800">{st.name}</span>
                          </div>

                          <div className="text-[11px] text-slate-500">
                            現在: <span className="font-semibold text-slate-700">{assignedChildren.length}名</span> （記入: {currentDays}日分）
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">スタッフ</th><th className="px-3 py-2 text-right">割り振り後の記入数</th></tr></thead>
                  <tbody>{staffList.filter(staff => selectedStaffForDist.has(staff.id)).map(staff => <tr key={staff.id} className="border-t border-slate-100"><th className="px-3 py-2 text-left font-medium">{staff.name}</th><td className="px-3 py-2 text-right tabular-nums">{distributionPreview[staff.id]?.totalDays ?? 0}日分</td></tr>)}</tbody>
                </table>
                <p className={`border-t border-slate-100 px-3 py-2 text-xs ${distributionRange > 2 ? 'text-amber-700' : 'text-emerald-700'}`}>スタッフ間の差：{distributionRange}日{distributionRange > 2 ? '（児童単位のため、2日以内に収まっていません）' : ''}</p>
              </div>

              {/* 当月の必要日数サマリー */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-600">当月の専門的を書く日数（{excludeIndividualWritingDays ? '個別療育を除く採用日数' : '採用日数'}）</span>
                <span className="font-bold text-sm text-slate-800">
                  {childrenData.reduce((sum, c) => sum + (c.id ? (childWritingDays[c.id] ?? 0) : 0), 0)} 日分
                  <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                    ({childrenData.filter(c => c.id && (childWritingDays[c.id] ?? 0) > 0).length}名)
                  </span>
                </span>
              </div>
            </div>

            {/* モーダルフッター */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDistributeModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-white transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDistributeRequiredDays}
                disabled={selectedStaffForDist.size === 0 || isSavingStaffAssignments || staffAssignmentLoadedScope !== `${selectedOfficeId}_${currentMonth}` || !hasStaffDistributionChanges}
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all hover:shadow active:scale-95 disabled:opacity-50"
              >
                {isSavingStaffAssignments ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Users size={14} />
                )}
                <span>均等に分配を実行</span>
              </button>
            </div>
          </div>
        </ViewportModal>
      )}

      {isSettingsOpen&&settingsTab==='implementation'&&implementationTab!=='author'&&<ViewportModal className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/60 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="implementation-operation-title" className="flex h-[90dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <header className="flex shrink-0 items-center justify-between border-b bg-slate-50 px-5 py-4"><h2 id="implementation-operation-title" className="font-bold text-slate-800">{implementationTab==='excel-import'?'Excel一括インポート':implementationTab==='excel-export'?'Excel一括上書き':'Excel一括上書き'}</h2><button type="button" aria-label="設定に戻る" onClick={()=>setImplementationTab('author')} className="min-h-10 rounded-xl px-3 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/80 p-4 sm:p-6"><p className="mb-4 text-xs text-slate-500">{officeName} ／ {year}年{month}月分</p>
            {implementationTab==='excel-import'&&<BatchExcelImport key={'import-'+selectedOfficeId+'-'+currentMonth} selectedOfficeId={selectedOfficeId} selectedMonth={currentMonth} childrenData={childrenData} onDataChange={()=>{invalidateMonthlyTreeCommunications(selectedOfficeId,currentMonth);setSettingsDataChanged(true);}}/>}
            {implementationTab==='excel-export'&&<BatchExcelExport key={'export-'+selectedOfficeId+'-'+currentMonth} selectedMonth={currentMonth} childrenData={childrenData} selectedOfficeId={selectedOfficeId}/>}
          </div>
          <footer className="flex shrink-0 justify-end border-t bg-slate-50 px-5 py-3"><button type="button" onClick={()=>setImplementationTab('author')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm">設定に戻る</button></footer>
        </section>
      </ViewportModal>}
      {transferRequest&&<DocumentTransferModal scope={{book:transferRequest.book,officeId:selectedOfficeId,month:currentMonth,children:childrenData}} officeName={officeName} direction={transferRequest.direction} beforeTransfer={async()=>{if(adoptionSaveInFlight.current)throw new Error('採用日の保存中です。保存後にもう一度操作してください。');}} onImported={async()=>{setSettingsDataChanged(true);await fetchData();}} onClose={()=>setTransferRequest(null)} onExcel={transferRequest.book==='implementation'?()=>setImplementationTab(transferRequest.direction==='export'?'excel-export':'excel-import'):transferRequest.direction==='import'?()=>setProfessionalExcelImportOpen(true):undefined}/>}
      {professionalExcelImportOpen&&<ProfessionalPlanBulkImportModal childrenData={childrenData} officeId={selectedOfficeId} officeName={officeName} onClose={()=>{setProfessionalExcelImportOpen(false);setSettingsDataChanged(true);}}/>}
      {managerSettingsOffice&&<ProfessionalManagerSettings officeId={managerSettingsOffice.id} officeName={managerSettingsOffice.name} onSaved={()=>{}} onClose={()=>setManagerSettingsOffice(null)}/>}
      {/* 設定モーダル */}
      {isSettingsOpen && (
        <ViewportModal className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="summary-settings-title" className="flex h-[90dvh] max-h-[900px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 border-b border-slate-100 flex shrink-0 items-center justify-between bg-slate-50">
              <h3 id="summary-settings-title" className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <SettingsIcon size={20} className="text-primary" />
                実施状況の設定
              </h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div role="tablist" aria-label="実施状況の設定カテゴリ" className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-4" onKeyDown={event => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const tabs = ['table', 'implementation','professional','office'] as const;
                const next = tabs[(tabs.indexOf(settingsTab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                setSettingsTab(next);
                document.getElementById(`summary-settings-tab-${next}`)?.focus();
              }
            }}>
              {([['table', '表の設定'], ['implementation', '専門的支援実施計画の設定'],['professional','個別支援計画書の設定'],['office','事業所設定']] as const).map(([value, label]) => (
                <button key={value} id={`summary-settings-tab-${value}`} type="button" role="tab" aria-selected={settingsTab === value} aria-controls={`summary-settings-panel-${value}`} tabIndex={settingsTab === value ? 0 : -1}
                  onClick={() => setSettingsTab(value)} className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${settingsTab === value ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* モーダルコンテンツ */}
            <div ref={settingsScrollRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-100/80 p-4 sm:p-6 [scrollbar-gutter:stable]">
              <div role="tabpanel" id="summary-settings-panel-professional" aria-labelledby="summary-settings-tab-professional" hidden={settingsTab!=='professional'} className="mx-auto w-full max-w-3xl">
                <SettingsGroup title="管理責任者"><div className="space-y-3 p-4"><p className="text-sm text-slate-600">{officeName}の個別支援計画書に使う、児童発達支援管理責任者氏名を設定します。</p><button type="button" disabled={!selectedOfficeId} onClick={()=>setManagerSettingsOffice({id:selectedOfficeId,name:officeName})} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><SettingsIcon size={18}/>管理責任者氏名の設定</button></div></SettingsGroup>
                <div className="mt-6"><SettingsGroup title="データの入出力"><button type="button" className={settingsRowClass+' w-full text-left hover:bg-slate-50'} onClick={()=>setTransferRequest({book:'professional',direction:'export'})}><span>全員分をエクスポート</span><span aria-hidden="true">›</span></button><button type="button" className={settingsRowClass+' w-full text-left hover:bg-slate-50'} onClick={()=>setTransferRequest({book:'professional',direction:'import'})}><span>全員分をインポート</span><span aria-hidden="true">›</span></button></SettingsGroup></div>
              </div>
              <div role="tabpanel" id="summary-settings-panel-office" aria-labelledby="summary-settings-tab-office" hidden={settingsTab!=='office'} className="mx-auto w-full max-w-3xl">
                <SettingsGroup title="事業所を選択">
                  <div className="px-4 py-3"><DropdownSelect label={officeName} value={selectedOfficeId} options={offices.map(office=>({value:office.id,label:office.name}))} onChange={id=>{if(id!==selectedOfficeId){setIsSettingsOpen(false);onOfficeChange(id);}}}/></div>
                </SettingsGroup>
              </div>
              <div role="tabpanel" id="summary-settings-panel-implementation" aria-labelledby="summary-settings-tab-implementation" hidden={settingsTab !== 'implementation'}>
                <div className="mx-auto w-full max-w-3xl space-y-6">

              <fieldset disabled={isImplementationSettingsLoading || isSavingSettings} className="space-y-6 border-0 p-0">
                <legend className="sr-only">専門的支援実施計画の作成者・作成日</legend>
                <SettingsGroup title="適用先">
                  <div className={settingsRowClass}><span>事業所</span><span className="text-right text-slate-500">{officeName}</span></div>
                  <div className={settingsRowClass}><span>対象月</span><span className="text-slate-500">{year}年{month}月分</span></div>
                </SettingsGroup>
                {isImplementationSettingsLoading ? <p className="text-sm text-slate-500">設定を読み込み中...</p> : <>
                  <SettingsGroup title="作成日・作成者"><div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                    <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-slate-700"><span>令和（年）</span><input type="number" min="1" step="1" aria-label="作成日の令和年" value={implementationDraft.implementationYear} onChange={e => setImplementationDraft(prev => ({ ...prev, implementationYear: e.target.value }))} className="min-h-10 w-16 rounded-lg bg-slate-50 px-3 py-2 text-right outline-emerald-600" /></label>
                    <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-slate-700"><span>月</span><input type="number" min="1" max="12" step="1" aria-label="作成日の月" value={implementationDraft.implementationMonth} onChange={e => setImplementationDraft(prev => ({ ...prev, implementationMonth: e.target.value }))} className="min-h-10 w-16 rounded-lg bg-slate-50 px-3 py-2 text-right outline-emerald-600" /></label>
                    <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-slate-700"><span>日</span><input type="number" min="1" max="31" step="1" aria-label="作成日の日" value={implementationDraft.implementationDay} onChange={e => setImplementationDraft(prev => ({ ...prev, implementationDay: e.target.value }))} className="min-h-10 w-16 rounded-lg bg-slate-50 px-3 py-2 text-right outline-emerald-600" /></label>
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700"><span className="shrink-0">作成者</span><input type="text" aria-label="専門的支援実施計画の作成者" value={implementationDraft.implementationCreator} onChange={e => setImplementationDraft(prev => ({ ...prev, implementationCreator: e.target.value }))} className="min-h-10 min-w-0 flex-1 w-32 rounded-lg bg-slate-50 px-3 py-2 text-right outline-emerald-600" placeholder="未設定" /></label>
                  </div>
                  </SettingsGroup>
                </>}
                {implementationSettingsError && <p role="alert" className="text-xs text-red-600">{implementationSettingsError}</p>}
              </fieldset>
                </div>
              <div className="mx-auto mt-6 w-full max-w-3xl space-y-6">
                <SettingsGroup title="データの入出力">
                  <button type="button" className={settingsRowClass+' w-full text-left hover:bg-slate-50'} onClick={()=>setTransferRequest({book:'implementation',direction:'export'})}><span>全員分をエクスポート</span><span aria-hidden="true">›</span></button>
                  <button type="button" className={settingsRowClass+' w-full text-left hover:bg-slate-50'} onClick={()=>setTransferRequest({book:'implementation',direction:'import'})}><span>全員分をインポート</span><span aria-hidden="true">›</span></button>
                </SettingsGroup>
              </div>
              </div>

              <div role="tabpanel" id="summary-settings-panel-table" aria-labelledby="summary-settings-tab-table" hidden={settingsTab !== 'table'} className="mx-auto w-full max-w-5xl">
<div className="grid items-start gap-6 md:grid-cols-[180px_minmax(0,1fr)]"><nav aria-label="表の設定項目" className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-2 md:block md:space-y-2"><button type="button" onClick={()=>scrollTableSetting('direction')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">表の表示方向</button><button type="button" onClick={()=>scrollTableSetting('staff')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">担当スタッフ欄の表示</button><button type="button" onClick={()=>scrollTableSetting('calculation')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">採用日の計算方法</button><button type="button" onClick={()=>scrollTableSetting('children')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">児童の表示</button><button type="button" onClick={()=>scrollTableSetting('focus')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">フォーカス表示</button><button type="button" onClick={()=>scrollTableSetting('rows')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">日数行の表示・非表示</button><button type="button" onClick={()=>scrollTableSetting('individual')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">個別療育の日</button><button type="button" onClick={()=>scrollTableSetting('holidays')} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-xs transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full">休みの日（非稼働日）</button></nav><div className="min-w-0 space-y-6">
                <SettingsGroup id="summary-table-direction" title="表の表示方向">
                  {([['children-columns', '児童を横に並べる（日付は縦）'], ['children-rows', '児童を縦に並べる（日付は横）']] as const).map(([value, label]) => (
                    <label key={value} className={settingsRowClass}>{label}<input type="radio" name="summary-table-orientation" checked={tempSettings.tableOrientation === value} onChange={() => setTempSettings(prev => ({ ...prev, tableOrientation: value }))} className="shrink-0 accent-green-600" /></label>
                  ))}
                </SettingsGroup>
                <SettingsGroup id="summary-table-staff" title="担当スタッフ欄の表示">
                    {([['icon', 'アイコン'], ['icon-name', 'アイコン＋名前'], ['name', '名前']] as const).map(([value, label]) => (
                      <label key={value} className={settingsRowClass}>{label}<input type="radio" name="staff-display-mode" checked={tempSettings.staffDisplayMode === value} onChange={() => setTempSettings(prev => ({ ...prev, staffDisplayMode: value }))} className="accent-green-600" /></label>
                    ))}
                </SettingsGroup>

                <SettingsGroup id="summary-table-calculation" title="採用日の計算方法">
                  <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_212px]">
                    <div className="space-y-3">
                      <p className="text-sm leading-relaxed text-slate-600">出席日数から算出した基準に、個別療育の日数を上乗せするか選びます。</p>
                      {([{value:true,label:'個別療育の日数を上乗せする',description:'基準4日＋個別2日＝採用6日。'},{value:false,label:'上乗せしない（必要数に含める）',description:'基準4日の中に個別2日を含めて採用4日。'}] as const).map(option=><label key={String(option.value)} className={settingsRowClass+' rounded-xl border border-slate-200 hover:bg-slate-50'}><span><span className="block font-semibold">{option.label}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">{option.description}</span></span><input type="radio" name="summary-adoption-calculation" checked={tempSettings.addIndividualDays===option.value} onChange={()=>setTempSettings(previous=>({...previous,addIndividualDays:option.value}))} className="shrink-0 accent-green-600"/></label>)}
                    </div>
                    <AdoptionCalculationExample addIndividualDays={tempSettings.addIndividualDays} individualColor={tempSettings.individualColor}/>
                  </div>
                </SettingsGroup>

<SettingsGroup id="summary-table-children" title="児童の表示"><label className={settingsRowClass}><span>出席日数が0日の児童を非表示にする</span><input type="checkbox" checked={tempSettings.hideZeroAttendance} onChange={e=>setTempSettings(previous=>({...previous,hideZeroAttendance:e.target.checked}))} className="h-4 w-4 shrink-0 accent-green-600"/></label></SettingsGroup>
              <SettingsGroup id="summary-table-focus" title="フォーカス表示">
                <label className={settingsRowClass}>
                  ポインターを合わせた行・列を強調表示する
                  <input type="checkbox" checked={tempSettings.focusHighlightEnabled}
                    onChange={e => setTempSettings(prev => ({ ...prev, focusHighlightEnabled: e.target.checked }))}
                    className="h-4 w-4 shrink-0 accent-green-600" />
                </label>
              </SettingsGroup>
              <SettingsGroup id="summary-table-rows" title="日数行の表示・非表示">
                  {countRowLabels.map(label => (
                    <label key={label} className={settingsRowClass}>
                      {label}
                      <input type="checkbox" checked={!tempSettings.hiddenCountRows.includes(label)}
                        onChange={e => setTempSettings(prev => ({ ...prev, hiddenCountRows: e.target.checked ? prev.hiddenCountRows.filter(item => item !== label) : [...prev.hiddenCountRows, label] }))}
                        className="h-4 w-4 accent-green-600" />
                    </label>
                  ))}
              </SettingsGroup>
              {/* 個別療育の日設定 */}
              <SettingsGroup id="summary-table-individual" title="個別療育の日">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    表示色
                  </h4>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {[
                        { name: 'スカイブルー', value: '#e0f2fe', class: 'bg-sky-100 border-sky-300' },
                        { name: 'パープル', value: '#f3e8ff', class: 'bg-purple-100 border-purple-300' },
                        { name: 'グリーン', value: '#dcfce7', class: 'bg-green-100 border-green-300' },
                        { name: 'イエロー', value: '#fef9c3', class: 'bg-yellow-100 border-yellow-300' },
                      ].map(c => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setTempSettings(prev => ({ ...prev, individualColor: c.value }))}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${c.class} ${tempSettings.individualColor === c.value ? 'ring-2 ring-primary ring-offset-1 scale-110' : 'hover:scale-105'}`}
                          title={c.name}
                        />
                      ))}
                      <input
                        type="color"
                        value={tempSettings.individualColor}
                        onChange={(e) => setTempSettings(prev => ({ ...prev, individualColor: e.target.value }))}
                        className="w-6 h-6 rounded-full border border-slate-300 cursor-pointer overflow-hidden p-0"
                        title="カスタムカラー"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
                    {['日', '月', '火', '水', '木', '金', '土'].map((d, index) => {
                      const isChecked = tempSettings.individualDaysOfWeek.includes(index);
                      const isSun = index === 0;
                      const isSat = index === 6;
                      
                      return (
                        <button
                          key={`individual-dow-${index}`}
                          type="button"
                          onClick={() => {
                            setTempSettings(prev => {
                              const individualDaysOfWeek = prev.individualDaysOfWeek.includes(index)
                                ? prev.individualDaysOfWeek.filter(x => x !== index)
                                : [...prev.individualDaysOfWeek, index].sort();
                              return { ...prev, individualDaysOfWeek };
                            });
                          }}
                          className={`py-3 px-1 text-sm font-bold rounded-xl border transition-all flex flex-col items-center justify-center gap-1
                            ${isChecked 
                              ? 'bg-blue-500 text-white border-blue-500 shadow-sm scale-105' 
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}
                        >
                          <span className="text-sm">{d}</span>
                          <span className={`text-[10px] ${isChecked ? 'text-blue-100' : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-400'}`}>
                            毎週
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </SettingsGroup>

              {/* 休みの日設定 */}
              <SettingsGroup id="summary-table-holidays" title="休みの日（非稼働日）">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                    表示色
                  </h4>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {[
                        { name: 'ローズ', value: '#ffe4e6', class: 'bg-rose-100 border-rose-300' },
                        { name: 'グレー', value: '#f1f5f9', class: 'bg-slate-100 border-slate-300' },
                        { name: 'オレンジ', value: '#ffedd5', class: 'bg-amber-100 border-amber-300' },
                        { name: '赤', value: '#fee2e2', class: 'bg-red-100 border-red-300' },
                      ].map(c => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setTempSettings(prev => ({ ...prev, holidayColor: c.value }))}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${c.class} ${tempSettings.holidayColor === c.value ? 'ring-2 ring-primary ring-offset-1 scale-110' : 'hover:scale-105'}`}
                          title={c.name}
                        />
                      ))}
                      <input
                        type="color"
                        value={tempSettings.holidayColor}
                        onChange={(e) => setTempSettings(prev => ({ ...prev, holidayColor: e.target.value }))}
                        className="w-6 h-6 rounded-full border border-slate-300 cursor-pointer overflow-hidden p-0"
                        title="カスタムカラー"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
                    {['日', '月', '火', '水', '木', '金', '土'].map((d, index) => {
                      const isChecked = tempSettings.holidayDaysOfWeek.includes(index);
                      const isSun = index === 0;
                      const isSat = index === 6;
                      
                      return (
                        <button
                          key={`holiday-dow-${index}`}
                          type="button"
                          onClick={() => {
                            setTempSettings(prev => {
                              const holidayDaysOfWeek = prev.holidayDaysOfWeek.includes(index)
                                ? prev.holidayDaysOfWeek.filter(x => x !== index)
                                : [...prev.holidayDaysOfWeek, index].sort();
                              return { ...prev, holidayDaysOfWeek };
                            });
                          }}
                          className={`py-3 px-1 text-sm font-bold rounded-xl border transition-all flex flex-col items-center justify-center gap-1
                            ${isChecked 
                              ? 'bg-rose-500 text-white border-rose-500 shadow-sm scale-105' 
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}
                        >
                          <span className="text-sm">{d}</span>
                          <span className={`text-[10px] ${isChecked ? 'text-rose-100' : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-400'}`}>
                            毎週
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </SettingsGroup>
                  </div>
                </div>
              </div>
            </div>

            {/* モーダルフッター */}
            <div className="min-h-[76px] px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold transition-all"
              >
                {settingsTab === 'table' || (settingsTab === 'implementation' && implementationTab === 'author') ? 'キャンセル' : '閉じる'}
              </button>
              {(settingsTab === 'table' || (settingsTab === 'implementation' && implementationTab === 'author')) && (
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings || isImplementationSettingsLoading || implementationSettingsKey !== `${selectedOfficeId}_${currentMonth}`}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>保存中...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>設定を保存</span>
                  </>
                )}
              </button>
              )}
            </div>
          </div>
        </ViewportModal>
      )}

      {/* Gemini一括登録モーダル */}
      <MonthlyResultImportModal
        isOpen={isResultImportOpen}
        onClose={() => setIsResultImportOpen(false)}
        monthStr={currentMonth}
        childrenData={childrenData}
        existingReports={mergedData.dailyReports}
        onGetSource={getAllTreeCommunicationsText}
        onImport={handleImportAllResults}
      />
    </div>
  );
};
