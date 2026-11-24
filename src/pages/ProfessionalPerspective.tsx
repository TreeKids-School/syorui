import {createPortal} from 'react-dom';
import {measureReads} from '../lib/readDiagnostics';
import {auditDocumentWrite} from '../lib/documentAudit';
import {DocumentTransferModal} from '../components/DocumentTransferModal';
import {ProfessionalPlanExportSettings} from '../components/ProfessionalPlanExportSettings';
import {ProfessionalManagerSettings} from '../components/ProfessionalManagerSettings';
import {getProfessionalManager,cleanProfessionalManagerName} from '../lib/professionalManager';
import {ChildSwitcher} from '../components/ChildSwitcher';
import {primaryVariantIndex,professionalMonthAvailability,saveProfessionalPrimary,archiveProfessionalVariants} from '../lib/professionalVariants';
import {DocumentIcon} from '../components/DocumentIcon';
import {copyProfessionalPeriod} from '../lib/copyProfessionalPeriod';
import {ViewportModal} from '../components/ViewportModal';
import {createDocumentAutoSaver,type DocumentSaveStatus} from '../lib/documentAutoSave';
import {professionalPlanDraft,professionalVariantSuffix,type ProfessionalDraft} from '../lib/professionalPlanDraft';
import {DropdownSelect} from '../components/ui/DropdownSelect';
import {InlineDateEditor} from '../components/InlineDateEditor';
import {DocumentTypeSelect} from '../components/DocumentTypeSelect';
import {HeaderAccountActions} from '../components/HeaderAccountActions';
import {DropdownPanel} from '../components/ui/DropdownPanel';
import {menuActionClass} from '../components/ui/menuStyles';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Printer, Settings, Download, CheckCircle2, UploadCloud, Archive } from 'lucide-react';
import {
  doc, serverTimestamp, collection, query, where, getDocs as firestoregetDocs, writeBatch, runTransaction
} from 'firebase/firestore';
const getDocs=measureReads('個別支援計画書',firestoregetDocs);

import { db } from '../lib/firebase';
import type { Child } from '../data/mockData';
import type { ProfessionalPlanDoc, SupportRow, SupportCategory, ServiceHoursPlan, DaySchedule } from '../types/professionalPlan';
import { FIVE_AREAS } from '../types/professionalPlan';
import { type Action } from '../components/FloatingActionMenu';
import { ProfessionalPlanImportModal } from '../components/ProfessionalPlanImportModal';
import {SupportImplementationPrintSettings} from '../components/SupportImplementationPrintSettings';
import type {ProfessionalPrintDocument} from '../lib/professionalPlanPrint';

const PLAN_COL = 'professionalPlans';
const HOURS_PLAN_COL = 'serviceHoursPlans';

const PROVIDER_DEFAULT = 'TreeKidsSchool\nSearch';

const defaultRows = (): SupportRow[] => [
  {
    id: crypto.randomUUID(),
    category: '本人支援',
    supportGoal: '',
    supportContent: '',
    fiveAreas: ['認知・行動', '言語・コミュニケーション', '人間関係・社会性'],
    achievementPeriod: '6ヶ月',
    provider: PROVIDER_DEFAULT,
    notes: '',
    priority: '1',
  },
  {
    id: crypto.randomUUID(),
    category: '本人支援',
    supportGoal: '',
    supportContent: '',
    fiveAreas: ['人間関係・社会性'],
    achievementPeriod: '6ヶ月',
    provider: PROVIDER_DEFAULT,
    notes: '',
    priority: '2',
  },
  {
    id: crypto.randomUUID(),
    category: '本人支援',
    supportGoal: '',
    supportContent: '',
    fiveAreas: ['機能・運動', '認知・行動', '健康・生活'],
    achievementPeriod: '6ヶ月',
    provider: PROVIDER_DEFAULT,
    notes: '',
    priority: '3',
  },
  {
    id: crypto.randomUUID(),
    category: '家族支援',
    supportGoal: '',
    supportContent: '',
    fiveAreas: [],
    achievementPeriod: '随時',
    provider: PROVIDER_DEFAULT,
    notes: '',
    priority: '随時',
  },
  {
    id: crypto.randomUUID(),
    category: '移行支援',
    supportGoal: '',
    supportContent: '',
    fiveAreas: [],
    achievementPeriod: '随時',
    provider: 'TreeKidsSchool',
    notes: '',
    priority: '随時',
  },
];

const defaultPlan = (childId: string): ProfessionalPlanDoc => ({
  childId,
  createdAt: new Date().toISOString().slice(0, 10),
  familyIntention: '',
  overallPolicy: '',
  longTermGoal: '',
  shortTermGoal: '',
  serviceHours: '',
  supportRows: defaultRows(),
  confirmation:
    '・支援する上で必要な情報を関係機関（学校、相談支援員、行政機関、他の事業所等）と共有する事もある。また、家庭支援加算を算定させていただきます。',
  managerName: '',
  signDate: new Date().toISOString().slice(0, 10),
  guardianName: '',
});

const defaultDaySchedule = (): DaySchedule => ({
  startTime: '',
  endTime: '',
  totalMinutes: 0,
  beforeExtStartTime: '',
  beforeExtEndTime: '',
  beforeExtMinutes: 0,
  afterExtStartTime: '',
  afterExtEndTime: '',
  afterExtMinutes: 0
});

const defaultWeeklyHours = () => {
  const hours: Record<string, DaySchedule> = {};
  ['月', '火', '水', '木', '金', '土', '日'].forEach(d => {
    hours[d] = defaultDaySchedule();
  });
  return hours;
};

const defaultHoursPlan = (childId: string, startMonth: string): ServiceHoursPlan => ({
  childId,
  effectiveStartDate:startMonth+'-01',
  startMonth,
  createdAt: new Date().toISOString().slice(0, 10),
  weeklyHours: defaultWeeklyHours(),
  extReason: '',
  notes: ''
});

type Props = { 
  childrenData: Child[];
  selectedOfficeId: string;
  offices: { id: string; name: string }[];
  onReload?: () => void;
};

// ---- 5領域チェックボックス ----
const FiveAreaCheckboxes: React.FC<{
  selected: string[];
  onChange: (areas: string[]) => void;
  readOnly?: boolean;
}> = ({ selected, onChange, readOnly }) => (
  <div className="flex flex-col gap-0.5 text-[10px]">
    {FIVE_AREAS.map((area) => (
      <label key={area} className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          className="w-3 h-3 accent-green-600"
          checked={selected.includes(area)}
          disabled={readOnly}
          onChange={(e) => {
            if (e.target.checked) onChange([...selected, area]);
            else onChange(selected.filter((a) => a !== area));
          }}
        />
        <span className="leading-tight">{area}</span>
      </label>
    ))}
  </div>
);

// ---- 編集可能セル ----
const EditCell: React.FC<{
  value: string;
  onChange: (v: string) => void;
  className?: string;
  rows?: number;
}> = ({ value, onChange, className = '', rows = 3 }) => {
  const handleWheel = (e: React.WheelEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight <= el.clientHeight) {
      const container = el.closest('.overflow-y-auto');
      if (container) {
        container.scrollTop += e.deltaY;
      }
    }
  };

  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none outline-none bg-transparent text-[12px] leading-relaxed ${className}`}
      style={{ touchAction: 'pan-y' }}
      onWheel={handleWheel}
    />
  );
};

// ---- 主コンポーネント ----
export const ProfessionalPerspective: React.FC<Props> = ({ childrenData, selectedOfficeId, offices, onReload }) => {
  const currentOffice = offices.find(o => o.id === selectedOfficeId);
  const officeName = currentOffice ? currentOffice.name : 'Search';
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();

  // textareaの上でスクロール（ホイール）したときに、親のメインコンテナをスクロールさせるヘルパー
  const handleWheel = (e: React.WheelEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight <= el.clientHeight) {
      const container = el.closest('.overflow-y-auto');
      if (container) {
        container.scrollTop += e.deltaY;
      }
    }
  };

  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [managerSettingsOpen,setManagerSettingsOpen]=useState(false);
  const [mobileHeaderSlot,setMobileHeaderSlot]=useState<HTMLElement|null>(null);
  useEffect(()=>{setMobileHeaderSlot(document.getElementById('mobile-summary-header-slot'));},[]);
  const [primaryIndex,setPrimaryIndex]=useState(0),[variantRecords,setVariantRecords]=useState<{id:string;variantIndex?:number;isPrimary?:boolean;archived?:boolean}[]>([]);
  const [archiveDialog,setArchiveDialog]=useState<{items:{collection:string;id:string;label:string;kind:'final'|'draft'|'hours'}[];selected:string[];archive:boolean}|null>(null),[documentActionError,setDocumentActionError]=useState('');
  const [archivedMonths,setArchivedMonths]=useState<string[]>([]);
  const explicitVariantScope=React.useRef('');
  const [variantIndex,setVariantIndex]=useState(0),[variantOptions,setVariantOptions]=useState<number[]>([0]);
  const [transferDirection,setTransferDirection]=useState<'export'|'import'|null>(null);
  const [exportDocuments,setExportDocuments]=useState<ProfessionalPrintDocument[]|null>(null);
  const [activeTab, setActiveTab] = useState<'final' | 'draft' | 'hours'>('final');
  const [plan, setPlan] = useState<ProfessionalPlanDoc | null>(null);
  const [hoursPlan, setHoursPlan] = useState<ServiceHoursPlan | null>(null);
  const [printDocuments,setPrintDocuments]=useState<ProfessionalPrintDocument[]|null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // 6ヶ月更新・年単位切り替え用の状態
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [periodArchiveMap, setPeriodArchiveMap] = useState<Record<string, boolean>>({});

  const [autoStatus,setAutoStatus]=useState<DocumentSaveStatus>('saved');
  const [addMonthOpen,setAddMonthOpen]=useState(false),[newMonth,setNewMonth]=useState(''),[addMonthError,setAddMonthError]=useState('');
  const [addMode,setAddMode]=useState<'blank'|'copy'>('blank'),[copyMonth,setCopyMonth]=useState(''),[copyKinds,setCopyKinds]=useState<('final'|'draft'|'hours')[]>(['final','draft','hours']),[addingMonth,setAddingMonth]=useState(false);
  const selectionScope=selectedOfficeId+'_'+childId+'_'+currentMonth+'_'+activeTab+'_'+showArchived;
  const scope=selectionScope+'_'+variantIndex;
  const activeScope=React.useRef(scope);activeScope.current=scope;
  const loadedScope=React.useRef(''),readSequence=React.useRef(0);
  const autoSaver=React.useRef<ReturnType<typeof createDocumentAutoSaver<ProfessionalDraft>>|null>(null);
  if(!autoSaver.current)autoSaver.current=createDocumentAutoSaver<ProfessionalDraft>(async (target,previous)=>{
    const content={...target.data};delete content.isPrimary;delete content.archived;
    const batch=writeBatch(db);
    batch.set(doc(db,target.collection,target.id),{...content,updatedAt:serverTimestamp()},{merge:true});
    auditDocumentWrite(batch,{officeId:String(target.data.officeId),book:'professional',childId:String(target.data.childId),month:String(target.data.startMonth),documentId:target.id,label:target.collection==='serviceHoursPlans'?'利用時間':target.data.status==='draft'?'案':'本案'},previous.data,content);
    await batch.commit();
  },(key,status)=>{if(activeScope.current===key)setAutoStatus(status);});
  useEffect(()=>()=>{void autoSaver.current!.flush(scope).catch(()=>{});},[scope]);
  useEffect(()=>{
    const flush=()=>{void autoSaver.current!.flushAll().catch(()=>{});};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',flush);
    return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',flush);flush();};
  },[]);
  useEffect(()=>{
    if(isLoading||loadedScope.current!==scope||!childId||!selectedOfficeId)return;
    const value=activeTab==='hours'?hoursPlan:plan;
    if(value)autoSaver.current!.schedule(scope,professionalPlanDraft(value,childId,selectedOfficeId,currentMonth,activeTab));
  },[plan,hoursPlan,isLoading,scope,childId,selectedOfficeId,currentMonth,activeTab]);

  const selectedChild = childId ? childrenData.find((c) => c.id === childId) : null;

  // ---- 存在する更新期の月リストを取得 ----
  const fetchAvailableMonths=useCallback(async()=>{
    if(!childId)return;
    try{
      const snapshots=await Promise.all([PLAN_COL,HOURS_PLAN_COL].map(name=>getDocs(query(collection(db,name),where('childId','==',childId),where('officeId','==',selectedOfficeId)))));
      const availability=professionalMonthAvailability(snapshots.flatMap(snapshot=>snapshot.docs.map(record=>record.data())));
      setAvailableMonths(availability.months);setPeriodArchiveMap(availability.archiveMap);setArchivedMonths(availability.archivedMonths);
      setCurrentMonth(previous=>{
        if(availability.months.includes(previous))return previous;
        const today=new Date().toISOString().slice(0,7);
        const active=availability.months.filter(month=>!availability.archiveMap[month]);
        const options=active.length?active:availability.months;
        return options.filter(month=>month<=today).at(-1)||options[0]||today;
      });
    }catch(error){console.error('fetchAvailableMonths error:',error);}
  },[childId,selectedOfficeId]);

  // ---- データ取得 ----
  const fetchData=useCallback(async()=>{
    if(!childId||!currentMonth){setIsLoading(false);return;}
    const localSelectionScope=selectedOfficeId+'_'+childId+'_'+currentMonth+'_'+activeTab+'_'+showArchived;
    const loadScope=localSelectionScope+'_'+variantIndex,sequence=++readSequence.current;
    const valid=()=>activeScope.current===loadScope&&sequence===readSequence.current;
    loadedScope.current='';setPlan(null);setHoursPlan(null);setIsLoading(true);
    try{
      await autoSaver.current!.flush(loadScope);if(!valid())return;
      const defaultManager=activeTab==='hours'?'':await getProfessionalManager(selectedOfficeId).catch(()=> '');if(!valid())return;
      const name=activeTab==='hours'?HOURS_PLAN_COL:PLAN_COL;
      const constraints=[where('childId','==',childId),where('officeId','==',selectedOfficeId)];
      if(activeTab!=='hours')constraints.push(where('status','==',activeTab));
      const snapshot=await getDocs(query(collection(db,name),...constraints));if(!valid())return;
      const records=snapshot.docs.map(record=>({...record.data(),id:record.id} as ProfessionalPlanDoc|ServiceHoursPlan)).filter(value=>(value.startMonth||value.createdAt?.slice(0,7))===currentMonth);
      setVariantRecords(records.map(record=>({id:record.id!,variantIndex:record.variantIndex,isPrimary:record.isPrimary,archived:record.archived})));
      const eligible=records.filter(record=>(record.archived===true)===showArchived);
      const preferred=primaryVariantIndex(eligible);setPrimaryIndex(preferred);
      setVariantOptions(Array.from(new Set(eligible.length?eligible.map(record=>record.variantIndex||0):[0])).sort((a,b)=>a-b));
      const selected=explicitVariantScope.current===localSelectionScope&&eligible.some(record=>(record.variantIndex||0)===variantIndex)?variantIndex:preferred;
      explicitVariantScope.current=localSelectionScope;
      if(selected!==variantIndex){setVariantIndex(selected);return;}
      let value=eligible.find(record=>(record.variantIndex||0)===selected);
      if(!value){
        if(showArchived||records.length)return;
        value=activeTab==='hours'?defaultHoursPlan(childId,currentMonth):{...defaultPlan(childId),status:activeTab,startMonth:currentMonth};
      }
      if(activeTab!=='hours')value={...value,managerName:cleanProfessionalManagerName((value as ProfessionalPlanDoc).managerName)||defaultManager} as ProfessionalPlanDoc;
      autoSaver.current!.loaded(loadScope,professionalPlanDraft(value,childId,selectedOfficeId,currentMonth,activeTab));
      loadedScope.current=loadScope;setAutoStatus('saved');
      if(activeTab==='hours')setHoursPlan(value as ServiceHoursPlan);else setPlan(value as ProfessionalPlanDoc);
    }catch(error){console.error('fetchData error:',error);if(valid())setAutoStatus('error');}
    finally{if(valid())setIsLoading(false);}
  },[childId,currentMonth,activeTab,selectedOfficeId,variantIndex,showArchived]);

  useEffect(() => {
    fetchAvailableMonths();
  }, [fetchAvailableMonths]);

  useEffect(() => { 
    fetchData(); 
  }, [fetchData]);

  // showArchived の変更、または availableMonths の取得後に currentMonth を適切に切り替える
  useEffect(() => {
    if (availableMonths.length === 0) {
      const current = new Date().toISOString().slice(0, 7);
      setCurrentMonth(current);
      return;
    }

    // 現在の表示モード（アーカイブ閲覧中か否か）に一致する月だけを抽出
    const validMonths = availableMonths.filter(m => {
      const isArchived = periodArchiveMap[m] === true;
      return showArchived?archivedMonths.includes(m):!isArchived;
    });

    // もし現在の currentMonth がそのリストに含まれていなければ、切り替えを行う
    if (!validMonths.includes(currentMonth)) {
      if (validMonths.length > 0) {
        // 今月以前で最新のものを優先
        const current = new Date().toISOString().slice(0, 7);
        const best = validMonths.filter(m => m <= current).pop() || validMonths[0];
        setCurrentMonth(best);
      } else {
        const fallback = new Date().toISOString().slice(0, 7);
        setCurrentMonth(fallback);
      }
    }
  }, [showArchived, availableMonths, periodArchiveMap,archivedMonths]);

  const setCurrentAsPrimary=async()=>{
    const value=activeTab==='hours'?hoursPlan:plan;if(!value?.id||showArchived||isSaving)return;
    setIsSaving(true);setDocumentActionError('');
    try{
      await autoSaver.current!.flushAll();
      await saveProfessionalPrimary(variantRecords.map(record=>({collection:activeTab==='hours'?HOURS_PLAN_COL:PLAN_COL,id:record.id})),value.id);
      await fetchData();
    }catch(error){setDocumentActionError(error instanceof Error?error.message:'メインの変更に失敗しました。');}
    finally{setIsSaving(false);}
  };
  const handleToggleArchive=async()=>{
    if(!childId||isSaving)return;
    setIsSaving(true);setDocumentActionError('');
    try{
      await autoSaver.current!.flushAll();
      const snapshots=await Promise.all([PLAN_COL,HOURS_PLAN_COL].map(name=>getDocs(query(collection(db,name),where('childId','==',childId),where('officeId','==',selectedOfficeId)))));
      const items=snapshots.flatMap((snapshot,index)=>snapshot.docs.flatMap(record=>{
        const value=record.data();if((value.startMonth||value.createdAt?.slice(0,7))!==currentMonth||(value.archived===true)!==showArchived)return [];
        const kind:'hours'|'final'|'draft'=index===1?'hours':value.status as 'final'|'draft';
        return [{collection:index===1?HOURS_PLAN_COL:PLAN_COL,id:record.id,kind,label:(kind==='hours'?'利用時間':kind==='draft'?'案':'本案')+professionalVariantSuffix(value.variantIndex)}];
      }));
      const current=activeTab==='hours'?hoursPlan?.id:plan?.id;
      setArchiveDialog({items,selected:items.filter(item=>item.id===current).map(item=>item.collection+'/'+item.id),archive:!showArchived});
    }catch(error){setDocumentActionError(error instanceof Error?error.message:'書類を取得できませんでした。');}
    finally{setIsSaving(false);}
  };
  const confirmArchive=async()=>{
    if(!archiveDialog||!archiveDialog.selected.length||isSaving)return;
    setIsSaving(true);setDocumentActionError('');
    try{
      await autoSaver.current!.flushAll();
      await archiveProfessionalVariants(archiveDialog.items.filter(item=>archiveDialog.selected.includes(item.collection+'/'+item.id)),archiveDialog.archive);
      setArchiveDialog(null);await fetchAvailableMonths();await fetchData();
    }catch(error){setDocumentActionError(error instanceof Error?error.message:'アーカイブの変更に失敗しました。');}
    finally{setIsSaving(false);}
  };

  // 一括インポート処理
  const handleImportComplete = async (importedPlans: ProfessionalPlanDoc[], importedHours: ServiceHoursPlan[]) => {
    if (!childId) return;

    const confirmMsg = `パースされた計画書 ${importedPlans.length} 件、利用時間 ${importedHours.length} 件を一括保存しますか？\n(既存の同期間・状態のデータは上書き更新されます)`;
    if (!window.confirm(confirmMsg)) return;

    setIsLoading(true);
    try {
      await autoSaver.current!.flushAll();
      const batch = writeBatch(db);

      if(importedPlans.length+importedHours.length>200)throw new Error('1回に取り込める書類は200件までです。ファイルを分割してください。');
      importedPlans.forEach(planDoc => {
        const startMonth = planDoc.startMonth || planDoc.createdAt.slice(0, 7) || currentMonth;
        const status = planDoc.status || 'final';
        auditDocumentWrite(batch,{officeId:selectedOfficeId,book:'professional',childId,month:startMonth,operation:'Excelインポート'},null,planDoc);
        const docId = professionalPlanDraft(planDoc,childId,selectedOfficeId,startMonth,status).id;
        
        batch.set(doc(db, PLAN_COL, docId), {
          ...planDoc,
          childId,
          officeId: selectedOfficeId,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      importedHours.forEach(hoursDoc => {
        const startMonth = hoursDoc.startMonth || currentMonth;
        auditDocumentWrite(batch,{officeId:selectedOfficeId,book:'professional',childId,month:startMonth,label:'利用時間',operation:'Excelインポート'},null,hoursDoc);
        const docId = professionalPlanDraft(hoursDoc,childId,selectedOfficeId,startMonth,'hours').id;
        
        batch.set(doc(db, HOURS_PLAN_COL, docId), {
          ...hoursDoc,
          childId,
          officeId: selectedOfficeId,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
      alert('一括インポートが正常に完了しました！');
      setIsImportOpen(false);
      
      await fetchAvailableMonths();
      await fetchData();
      onReload?.();
    } catch (e: any) {
      console.error(e);
      alert(`インポートデータの保存中にエラーが発生しました: ${e.message || String(e)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ---- plan更新ヘルパー ----
  const update = <K extends keyof ProfessionalPlanDoc>(key: K, value: ProfessionalPlanDoc[K]) =>
    setPlan((prev) => prev ? { ...prev, [key]: value } : prev);

  const updateRow = (rowId: string, patch: Partial<SupportRow>) =>
    setPlan((prev) =>
      prev
          ? { ...prev, supportRows: prev.supportRows.map((r) => r.id === rowId ? { ...r, ...patch } : r) }
          : prev
    );

  const addRow = (category: SupportCategory) =>
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            supportRows: [
              ...prev.supportRows,
              {
                id: crypto.randomUUID(),
                category,
                supportGoal: '',
                supportContent: '',
                fiveAreas: [],
                achievementPeriod: '',
                provider: PROVIDER_DEFAULT,
                notes: '',
                priority: '',
              },
            ],
          }
        : prev
    );

  // ---- 利用時間更新ヘルパー ----
  const updateDaySchedule = (day: string, patch: Partial<DaySchedule>) => {
    setHoursPlan(prev => {
      if (!prev) return prev;
      const current = prev.weeklyHours[day] || defaultDaySchedule();
      const updatedDay = { ...current, ...patch };

      const parseMin = (t: string) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };

      if (patch.startTime !== undefined || patch.endTime !== undefined) {
        const diff = parseMin(updatedDay.endTime) - parseMin(updatedDay.startTime);
        updatedDay.totalMinutes = diff > 0 ? diff : 0;
      }
      if (patch.beforeExtStartTime !== undefined || patch.beforeExtEndTime !== undefined) {
        const diff = parseMin(updatedDay.beforeExtEndTime) - parseMin(updatedDay.beforeExtStartTime);
        updatedDay.beforeExtMinutes = diff > 0 ? diff : 0;
      }
      if (patch.afterExtStartTime !== undefined || patch.afterExtEndTime !== undefined) {
        const diff = parseMin(updatedDay.afterExtEndTime) - parseMin(updatedDay.afterExtStartTime);
        updatedDay.afterExtMinutes = diff > 0 ? diff : 0;
      }

      return {
        ...prev,
        weeklyHours: {
          ...prev.weeklyHours,
          [day]: updatedDay
        }
      };
    });
  };

  const updateHoursPlanField = (field: 'extReason' | 'notes', val: string) => {
    setHoursPlan(prev => prev ? { ...prev, [field]: val } : prev);
  };

  const formatMinutes = (mins: number) => {
    if (!mins) return '0時間00分';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}時間${m.toString().padStart(2, '0')}分`;
  };

  // ---- 印刷 ----
  const handlePrint = () => {void handlePrintAll();};

  // ---- まとめて印刷（一括印刷） ----
  const loadPeriodDocuments=async(includeMissing:boolean):Promise<ProfessionalPrintDocument[]>=>{
    if(!childId||!selectedChild)return [];
      await autoSaver.current!.flushAll();
      const [plansSnap,hoursSnap]=await Promise.all([
        getDocs(query(collection(db,PLAN_COL),where('childId','==',childId),where('officeId','==',selectedOfficeId))),
        getDocs(query(collection(db,HOURS_PLAN_COL),where('childId','==',childId),where('officeId','==',selectedOfficeId))),
      ]);
      const plans=plansSnap.docs.map(record=>({...record.data(),id:record.id} as ProfessionalPlanDoc)).filter(value=>(value.startMonth||value.createdAt?.slice(0,7))===currentMonth&&(value.archived===true)===showArchived);
      const hours=hoursSnap.docs.map(record=>({...record.data(),id:record.id} as ServiceHoursPlan)).filter(value=>value.startMonth===currentMonth&&(value.archived===true)===showArchived);
      const defaultManager=await getProfessionalManager(selectedOfficeId).catch(()=> '');
      const documents:ProfessionalPrintDocument[]=[];
      const common={childName:selectedChild.fullName,officeName};
      for(const kind of ['final','draft','hours'] as const){
        let records:(ProfessionalPlanDoc|ServiceHoursPlan)[]=kind==='hours'?hours:plans.filter(value=>value.status===kind);
        const editing=kind===activeTab?(kind==='hours'?hoursPlan:plan):null;
        if(editing)records=[...records.filter(value=>(value.variantIndex||0)!==variantIndex),editing];
        if(!records.length){if(showArchived||!includeMissing)continue;const initial=kind==='hours'?defaultHoursPlan(childId,currentMonth):{...defaultPlan(childId),startMonth:currentMonth,status:kind};records=[initial];}
        for(const value of records.sort((a,b)=>(a.variantIndex||0)-(b.variantIndex||0))){
          const index=value.variantIndex||0,key=kind+':'+index,label=(kind==='final'?'本案':kind==='draft'?'案':'利用時間')+professionalVariantSuffix(index);
          documents.push(kind==='hours'?{...common,key,label,hoursPlan:value as ServiceHoursPlan}:{...common,key,label,plan:{...value as ProfessionalPlanDoc,status:kind,managerName:cleanProfessionalManagerName((value as ProfessionalPlanDoc).managerName)||defaultManager}});
        }
      }
    return documents;
  };
  const handlePrintAll=async()=>{
    setIsSaving(true);
    try{setPrintDocuments(await loadPeriodDocuments(true));}
    catch(error){console.error(error);alert('印刷用のデータを取得できませんでした。');}
    finally{setIsSaving(false);}
  };
  const handleExcelExport=async()=>{
    setIsSaving(true);setDocumentActionError('');
    try{setExportDocuments(await loadPeriodDocuments(false));}
    catch(error){console.error(error);setDocumentActionError('エクスポートする書類を取得できませんでした。もう一度お試しください。');}
    finally{setIsSaving(false);}
  };

  const isPeriodStatusMatch = activeTab==='hours'?hoursPlan!==null:plan!==null;

  // ---- ローディング ----
  if (isLoading || childrenData.length === 0) {
    return <div className="p-20 text-center text-slate-400">読み込み中...</div>;
  }
  if (!selectedChild) {
    return <div className="p-20 text-center text-slate-400">児童データが見つかりません</div>;
  }
  if (isPeriodStatusMatch && ((activeTab === 'hours' && !hoursPlan) || (activeTab !== 'hours' && !plan))) {
    return <div className="p-20 text-center text-slate-400">データが見つかりません</div>;
  }

  // 作成年月日のパース
  const dateStr = activeTab === 'hours' ? (hoursPlan?.effectiveStartDate || hoursPlan?.createdAt || '') : (plan?.createdAt || '');
  const [cy, cm, cd] = dateStr ? dateStr.split('-') : ['', '', ''];

  const signDateStr = plan?.signDate || '';
  const [sy, sm, sd] = signDateStr ? signDateStr.split('-') : ['', '', ''];

  const mobileActions: Action[] = [
    {label:'エクスポート',icon:<Download size={18}/>,onClick:()=>setTransferDirection('export')},
    {label:'インポート',icon:<UploadCloud size={18}/>,onClick:()=>setTransferDirection('import')},
    { 
      label: showArchived ? '書類を選んでアーカイブ解除' : '書類を選んでアーカイブ', 
      icon: <Archive size={18} />, 
      onClick: handleToggleArchive,
      colorClass: showArchived ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'
    },
    { 
      label: showArchived ? 'アーカイブ表示中' : 'アーカイブを見る', 
      icon: <Archive size={18} />, 
      onClick: () => setShowArchived(prev => !prev),
      colorClass: showArchived ? 'bg-amber-600 text-white' : ''
    },

  ];

  // 任意の月（年月）を追加するハンドラー
  const handleAddPeriod=()=>{setNewMonth(currentMonth);setCopyMonth(availableMonths.includes(currentMonth)?currentMonth:availableMonths.slice().sort().at(-1)||'');setAddMode('blank');setCopyKinds(['final','draft','hours']);setAddMonthError('');setAddMonthOpen(true);};
  const confirmAddMonth=async()=>{
    if(addingMonth||!childId||!selectedOfficeId)return;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(newMonth)){setAddMonthError('年月を選択してください。');return;}
    if(periodArchiveMap[newMonth]){setAddMonthError('この月はアーカイブされています。設定からアーカイブ表示へ切り替えてください。');return;}
    setAddMonthError('');setAddingMonth(true);
    try{
      await autoSaver.current!.flushAll();
      if(addMode==='copy'){
        if(availableMonths.includes(newMonth))throw new Error('追加先の月はすでに登録されています。別の年月を選択してください。');
        const [plans,hours]=await Promise.all([
          getDocs(query(collection(db,PLAN_COL),where('childId','==',childId),where('officeId','==',selectedOfficeId))),
          getDocs(query(collection(db,HOURS_PLAN_COL),where('childId','==',childId),where('officeId','==',selectedOfficeId))),
        ]);
        const source={plans:plans.docs.map(record=>record.data() as ProfessionalPlanDoc),hours:hours.docs.map(record=>record.data() as ServiceHoursPlan)};
        if([...source.plans,...source.hours].some(value=>(value.startMonth||value.createdAt?.slice(0,7))===newMonth))throw new Error('追加先の月には書類があります。上書きせず中止しました。');
        const targets=copyProfessionalPeriod(source,childId,selectedOfficeId,copyMonth,newMonth,copyKinds);
        await runTransaction(db,async transaction=>{
          const refs=targets.map(target=>doc(db,target.collection,target.id));
          const existing=await Promise.all(refs.map(ref=>transaction.get(ref)));
          if(existing.some(record=>record.exists()))throw new Error('追加先の月には書類があります。上書きせず中止しました。');
          targets.forEach((target,index)=>{transaction.set(refs[index],{...target.data,updatedAt:serverTimestamp()});auditDocumentWrite(transaction,{officeId:selectedOfficeId,book:'professional',childId,month:newMonth,documentId:target.id,operation:'月をコピーして追加'},null,target.data);});
        });
        const copiedKinds=targets.map(target=>target.collection===HOURS_PLAN_COL?'hours':target.data.status as 'final'|'draft');
        if(!copiedKinds.includes(activeTab))setActiveTab(copiedKinds[0]);
      }
      setAvailableMonths(previous=>Array.from(new Set([...previous,newMonth])).sort());
      setCurrentMonth(newMonth);setAddMonthOpen(false);
    }catch(error){setAddMonthError(error instanceof Error?error.message:'対象月を追加できませんでした。');}
    finally{setAddingMonth(false);}
  };

  const monthOptions = Array.from(new Set([...availableMonths.filter(month=>showArchived?archivedMonths.includes(month):!periodArchiveMap[month]),currentMonth]))
    .sort((a,b)=>b.localeCompare(a)).map(month=>({value:month,label:month.split('-')[0]+'年'+Number(month.split('-')[1])+'月'}));
  if(!showArchived)monthOptions.push({value:'add',label:'＋ 月を追加'});

  const documentControls = (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {/* タブ切り替え */}
        <div className="flex bg-slate-200/60 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('final')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'final'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            本案
          </button>
          <button
            onClick={() => setActiveTab('draft')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'draft'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            案
          </button>
          <button
            onClick={() => setActiveTab('hours')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'hours'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            利用時間
          </button>
        </div>
        {variantOptions.length>1&&<DropdownSelect label="同月の書類を選択" value={String(variantIndex)} options={variantOptions.map(index=>({value:String(index),label:(activeTab==='final'?'本案':activeTab==='draft'?'案':'利用時間')+professionalVariantSuffix(index)+(!showArchived&&index===primaryIndex?'（メイン）':'')}))} onChange={value=>{explicitVariantScope.current=selectionScope;setVariantIndex(Number(value));}}/>}
        {!showArchived&&variantOptions.length>1&&(variantIndex===primaryIndex?<span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><CheckCircle2 size={16}/>メイン</span>:<button type="button" disabled={isSaving} onClick={()=>void setCurrentAsPrimary()} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 disabled:opacity-50">メインに設定</button>)}
        <div className="ml-auto"><InlineDateEditor key={childId+'_'+selectedOfficeId+'_'+currentMonth+'_'+activeTab+'_'+variantIndex} label={activeTab==='draft'?'作成年月日':'開始年月日'} value={dateStr} onChange={value=>{if(activeTab==='hours')setHoursPlan(previous=>previous?{...previous,effectiveStartDate:value}:previous);else update('createdAt',value);}}/></div>
      </div>
  );

  const settingsMenu=(<DropdownPanel itemCount={mobileActions.length+1} preferredHeight={(mobileActions.length+1)*64+56} label="個別支援計画書の設定" icon={<Settings size={20}/>}>
            {close=><><button type="button" className={menuActionClass} onClick={()=>{close();setManagerSettingsOpen(true);}}><DocumentIcon type="professional"/>管理責任者氏名の設定</button>{mobileActions.filter(action=>!['保存する','印刷'].includes(action.label)).map(action=><button type="button" key={action.label} className={menuActionClass+(showArchived&&action.label==='アーカイブ表示中'?' bg-amber-100 text-amber-900':'')} disabled={action.disabled||isSaving} onClick={()=>{close();action.onClick();}}>{action.icon}{action.label}</button>)}</>}
          </DropdownPanel>);
  return (
    <div id="prof-plan-print" className="max-w-6xl mx-auto flex flex-col gap-6 pb-24 animate-fade-in">
      {showArchived&&<div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900 print:hidden"><span className="flex items-center gap-2"><Archive size={18}/>アーカイブ表示中</span><button type="button" onClick={()=>setShowArchived(false)} className="min-h-10 rounded-xl border border-amber-300 bg-white px-3 text-sm">通常表示に戻る</button></div>}
      {documentActionError&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 print:hidden">{documentActionError}</p>}
      {archiveDialog&&<ViewportModal className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-900/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="archive-documents-title" className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><h2 id="archive-documents-title" className="text-lg font-bold">{currentMonth}：{archiveDialog.archive?'アーカイブする書類':'アーカイブを解除する書類'}</h2><p className="text-sm text-slate-500">選択した書類だけを変更します。</p><div className="space-y-2">{archiveDialog.items.map(item=><label key={item.collection+'/'+item.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm"><input type="checkbox" disabled={isSaving} checked={archiveDialog.selected.includes(item.collection+'/'+item.id)} onChange={event=>setArchiveDialog(previous=>previous?{...previous,selected:event.target.checked?[...previous.selected,item.collection+'/'+item.id]:previous.selected.filter(key=>key!==item.collection+'/'+item.id)}:previous)}/><DocumentIcon type="professional"/>{item.label}</label>)}</div>{!archiveDialog.items.length&&<p className="text-sm text-slate-500">対象の書類がありません。</p>}<div className="space-y-3">{documentActionError&&<p role="alert" className="text-sm text-rose-600">{documentActionError}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={isSaving} onClick={()=>setArchiveDialog(null)} className="min-h-10 rounded-xl border px-4 text-sm">キャンセル</button><button type="button" disabled={isSaving||!archiveDialog.selected.length} onClick={()=>void confirmArchive()} className="min-h-10 rounded-xl bg-primary px-4 text-sm text-white disabled:opacity-40">{isSaving?'変更中…':'選択した'+archiveDialog.selected.length+'件を'+(archiveDialog.archive?'アーカイブ':'解除')}</button></div></div></section></ViewportModal>}

      {addMonthOpen&&<ViewportModal className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-900/50 p-4" onKeyDown={event=>{if(event.key==='Escape'&&!addingMonth)setAddMonthOpen(false);}}>
        <form role="dialog" aria-modal="true" aria-labelledby="add-month-title" onSubmit={event=>{event.preventDefault();void confirmAddMonth();}} className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <h2 id="add-month-title" className="text-lg font-bold">対象月を追加</h2>
          <fieldset disabled={addingMonth} className="space-y-4 disabled:opacity-60">
            <label className="block space-y-2 text-sm"><span>追加先の年月</span><input autoFocus required type="month" value={newMonth} onChange={event=>setNewMonth(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-200 px-3"/></label>
            <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="add-mode" checked={addMode==='blank'} onChange={()=>setAddMode('blank')}/>空白で追加</label><label className="flex items-center gap-2"><input type="radio" name="add-mode" checked={addMode==='copy'} onChange={()=>setAddMode('copy')}/>登録済みの月をコピー</label></div>
            {addMode==='copy'&&<div className="space-y-3 rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold">コピー元の月</p><DropdownSelect label={copyMonth?copyMonth.split('-')[0]+'年'+Number(copyMonth.split('-')[1])+'月':'コピー元の月'} value={copyMonth} onChange={setCopyMonth} options={availableMonths.slice().sort((a,b)=>b.localeCompare(a)).map(month=>({value:month,label:month.split('-')[0]+'年'+Number(month.split('-')[1])+'月'}))}/><div className="flex flex-wrap gap-4 text-sm">{([{value:'final',label:'本案'},{value:'draft',label:'案'},{value:'hours',label:'利用時間'}] as const).map(kind=><label key={kind.value} className="flex items-center gap-2"><input type="checkbox" checked={copyKinds.includes(kind.value)} onChange={event=>setCopyKinds(previous=>event.target.checked?[...previous,kind.value]:previous.filter(value=>value!==kind.value))}/>{kind.label}</label>)}</div><p className="text-xs leading-relaxed text-slate-500">コピー元に登録されている書類を追加します。開始日・作成日は追加月の1日とし、保護者署名・同意日・過去の反映期間は引き継ぎません。</p></div>}
          </fieldset>
          {addMonthError&&<p role="alert" className="text-sm text-rose-600">{addMonthError}</p>}
          <p className="text-xs text-slate-500">追加した後の変更は自動保存されます。登録済みの月へのコピー上書きは行いません。</p>
          <div className="flex justify-end gap-3"><button type="button" disabled={addingMonth} onClick={()=>setAddMonthOpen(false)} className="min-h-10 rounded-xl border px-4 text-sm disabled:opacity-50">キャンセル</button><button type="submit" disabled={addingMonth||(addMode==='copy'&&(!copyMonth||!copyKinds.length))} className="min-h-10 rounded-xl bg-primary px-4 text-sm text-white disabled:opacity-50">{addingMonth?'追加中…':addMode==='copy'?'コピーして追加':'追加して開く'}</button></div>
        </form>
      </ViewportModal>}
      {autoStatus==='error'&&<div role="alert" className="flex items-center justify-end gap-2 text-sm text-rose-600 print:hidden"><span>{loadedScope.current===scope?'自動保存に失敗しました。入力内容は画面に保持しています。':'書類を読み込めませんでした。'}</span><button type="button" onClick={()=>{if(loadedScope.current!==scope)void fetchData();else void autoSaver.current!.flush(scope).catch(()=>{});}} className="min-h-10 rounded-xl border px-3">再試行</button></div>}
      {mobileHeaderSlot&&createPortal(<div className="mobile-document-header pb-2">
        <DocumentTypeSelect childId={childId!} month={currentMonth} current="professional"/>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1"><ChildSwitcher childId={childId!} name={selectedChild.fullName} childrenData={childrenData} officeId={selectedOfficeId} current="professional" month={currentMonth}/></div>
          <DropdownSelect label={currentMonth.replace('-', '年')+'月'} value={currentMonth} options={monthOptions} onChange={month=>{if(month==='add')handleAddPeriod();else setCurrentMonth(month);}}/>
          {settingsMenu}
        </div>
      </div>,mobileHeaderSlot)}
      <div className={'document-desktop-header flex shrink-0 flex-col justify-between gap-3 rounded-2xl border px-5 py-3 shadow-sm print:hidden lg:flex-row lg:items-center '+(showArchived?'border-amber-300 bg-amber-50':'border-slate-200/80 bg-white')}>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" aria-label="実施状況の表へ戻る" onClick={()=>navigate('/monthly-summary')} className="shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={20}/></button>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1"><h2 className="min-w-0"><DocumentTypeSelect childId={childId!} month={currentMonth} current="professional"/></h2><ChildSwitcher childId={childId!} name={selectedChild.fullName} childrenData={childrenData} officeId={selectedOfficeId} current="professional" month={currentMonth}/></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <DropdownSelect label="対象月を選択" value={currentMonth} options={monthOptions} onChange={month=>{if(month==='add')handleAddPeriod();else setCurrentMonth(month);}}/>
          <button type="button" aria-label="印刷" title="印刷設定とプレビュー" onClick={handlePrint} className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"><Printer size={20}/></button>
          {settingsMenu}
          <HeaderAccountActions/>
        </div>
      </div>

      {/* ======== 書類本体：個別支援計画書（本案 / 案） ======== */}
      {activeTab !== 'hours' && plan && isPeriodStatusMatch && (
        <div className="bg-white border border-slate-300 shadow-sm p-6 print:shadow-none print:border-0 print:p-0" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
          {documentControls}

          {/* ===== ヘッダー ===== */}
          <div className="hidden print:flex items-start justify-between mb-2">
            {/* 左：利用児氏名 */}
            <div className="flex items-baseline gap-1 text-sm">
              <span className="whitespace-nowrap">利用児氏名：</span>
              <div className="border-b border-slate-400 min-w-[160px] px-1">
                <input
                  className="outline-none bg-transparent w-full text-base font-bold"
                  value={selectedChild.fullName}
                  readOnly
                />
              </div>
              <span className="ml-1">様</span>
            </div>
            {/* 中央：タイトル */}
            <div className="text-center flex-1">
              <h1 className="text-xl font-black tracking-wide">
                個別支援計画書　<span className="font-normal text-base">({officeName})</span>
                <span className="text-sm font-bold text-slate-500 ml-2">
                  {plan.status === 'draft' ? '【案】' : '【本案】'}
                </span>
              </h1>
            </div>
            <span className="text-sm">{activeTab==='final'?'開始年月日：':'作成年月日：'}{dateStr?dateStr.replace(/-/g,'/'):''}</span>
          </div>

          {/* ===== 枠線テーブル全体 ===== */}
          <table className="w-full border-collapse text-sm" style={{ borderLeft: '1.5px solid #374151', borderTop: '1.5px solid #374151' }}>
            <tbody>
              {/* ----- 利用児及び家族の生活に対する意向 ----- */}
              <tr>
                <td
                  className="bg-slate-100 text-center align-middle font-medium text-[13px] p-2 leading-tight"
                  style={{ border: '1.5px solid #374151', width: '16%' }}
                  rowSpan={1}
                >
                  利用児及び家族の<br />生活に対する意向
                </td>
                <td style={{ border: '1.5px solid #374151' }} colSpan={3} className="p-1">
                  <textarea
                    rows={3}
                    className="w-full resize-none outline-none bg-transparent text-sm leading-relaxed p-1"
                    style={{ touchAction: 'pan-y' }}
                    onWheel={handleWheel}
                    value={plan.familyIntention}
                    onChange={(e) => update('familyIntention', e.target.value)}
                  />
                </td>
              </tr>

              {/* 空白区切り行 */}
              <tr><td colSpan={4} style={{ height: '6px', border: 'none' }} /></tr>

              {/* ----- 総合的な支援の方針 ----- */}
              <tr>
                <td
                  className="bg-slate-100 text-center align-middle font-medium text-[13px] p-2"
                  style={{ border: '1.5px solid #374151' }}
                >
                  総合的な支援の方針
                </td>
                <td style={{ border: '1.5px solid #374151' }} colSpan={3} className="p-1">
                  <textarea
                    rows={3}
                    className="w-full resize-none outline-none bg-transparent text-sm leading-relaxed p-1"
                    style={{ touchAction: 'pan-y' }}
                    onWheel={handleWheel}
                    value={plan.overallPolicy}
                    onChange={(e) => update('overallPolicy', e.target.value)}
                  />
                </td>
              </tr>

              {/* 空白区切り行 */}
              <tr><td colSpan={4} style={{ height: '6px', border: 'none' }} /></tr>

              {/* ----- 長期目標・短期目標 + 支援時間 ----- */}
              <tr>
                <td
                  className="bg-slate-100 text-center align-middle font-medium text-[13px] p-2 leading-tight"
                  style={{ border: '1.5px solid #374151' }}
                >
                  長期目標<br /><span className="text-[11px]">（内容・期間等）</span>
                </td>
                <td style={{ border: '1.5px solid #374151', width: '54%' }} className="p-1">
                  <textarea
                    rows={2}
                    className="w-full resize-none outline-none bg-transparent text-sm leading-relaxed p-1"
                    style={{ touchAction: 'pan-y' }}
                    onWheel={handleWheel}
                    value={plan.longTermGoal}
                    onChange={(e) => update('longTermGoal', e.target.value)}
                  />
                </td>
                <td
                  className="bg-slate-100 text-center align-middle font-medium text-[12px] p-2 leading-tight"
                  style={{ border: '1.5px solid #374151', width: '16%' }}
                  rowSpan={2}
                >
                  支援の標準的な提供時間等<br /><span className="text-[10px]">（曜日・頻度・時間）</span>
                </td>
                <td style={{ border: '1.5px solid #374151', width: '14%' }} rowSpan={2} className="p-1">
                  <textarea
                    rows={4}
                    className="w-full h-full resize-none outline-none bg-transparent text-sm leading-relaxed p-1"
                    style={{ touchAction: 'pan-y' }}
                    onWheel={handleWheel}
                    value={plan.serviceHours}
                    onChange={(e) => update('serviceHours', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <td
                  className="bg-slate-100 text-center align-middle font-medium text-[13px] p-2 leading-tight"
                  style={{ border: '1.5px solid #374151' }}
                >
                  短期目標<br /><span className="text-[11px]">（内容・期間等）</span>
                </td>
                <td style={{ border: '1.5px solid #374151' }} className="p-1">
                  <textarea
                    rows={2}
                    className="w-full resize-none outline-none bg-transparent text-sm leading-relaxed p-1"
                    style={{ touchAction: 'pan-y' }}
                    onWheel={handleWheel}
                    value={plan.shortTermGoal}
                    onChange={(e) => update('shortTermGoal', e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* ===== ○支援目標及び具体的な支援内容等 ===== */}
          <div className="mt-3 mb-1 text-[13px] font-medium">○支援目標及び具体的な支援内容等</div>

          <div className="overflow-x-auto print:overflow-visible" style={{ touchAction: 'pan-y' }}>
            <table className="w-full border-collapse text-[12px]" style={{ borderLeft: '1.5px solid #374151', borderTop: '1.5px solid #374151' }}>
              <thead>
                <tr className="bg-slate-100 text-center text-[12px]">
                  <th style={{ border: '1.5px solid #374151', width: '7%' }} className="p-2 align-middle">項　目</th>
                  <th style={{ border: '1.5px solid #374151', width: '15%' }} className="p-2 align-middle leading-tight">
                    支援目標<br />
                    <span className="text-[10px] font-normal">（具体的な到達目標）</span>
                  </th>
                  <th style={{ border: '1.5px solid #374151' }} className="p-2 align-middle leading-tight">
                    支援内容<br />
                    <span className="text-[10px] font-normal">（内容・支援の提供上のポイント・5領域（※）との関連性等）</span>
                  </th>
                  <th style={{ border: '1.5px solid #374151', width: '7%' }} className="p-2 align-middle leading-tight">
                    達成<br />時期
                  </th>
                  <th style={{ border: '1.5px solid #374151', width: '11%' }} className="p-2 align-middle leading-tight">
                    担当者<br />提供機関
                  </th>
                  <th style={{ border: '1.5px solid #374151', width: '17%' }} className="p-2 align-middle leading-tight">
                    留意事項<br />
                    <span className="text-[10px] font-normal">（本人の役割を含む）</span>
                  </th>
                  <th style={{ border: '1.5px solid #374151', width: '5%' }} className="p-2 align-middle leading-tight">
                    優先<br />順位
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.supportRows.map((row, idx) => {
                  const isFirstInCategory = idx === 0 || plan.supportRows[idx - 1].category !== row.category;
                  const categoryCount = plan.supportRows.filter((r) => r.category === row.category).length;

                  return (
                    <tr key={row.id} className="align-top">
                      {isFirstInCategory && (
                        <td
                          className="text-center font-medium align-middle bg-slate-50 text-[12px]"
                          style={{ border: '1.5px solid #374151' }}
                          rowSpan={categoryCount}
                        >
                          {row.category}
                        </td>
                      )}

                      {/* 支援目標 */}
                      <td style={{ border: '1.5px solid #374151' }} className="p-1">
                        <EditCell
                          value={row.supportGoal}
                          onChange={(v) => updateRow(row.id, { supportGoal: v })}
                        />
                      </td>

                      {/* 支援内容 */}
                      <td style={{ border: '1.5px solid #374151' }} className="p-1">
                        <div className="flex gap-2">
                          <EditCell
                            value={row.supportContent}
                            onChange={(v) => updateRow(row.id, { supportContent: v })}
                            className="flex-1"
                          />
                          {row.category === '本人支援' && (
                            <div className="border-l border-slate-200 pl-2 flex-shrink-0">
                              <FiveAreaCheckboxes
                                selected={row.fiveAreas}
                                onChange={(areas) => updateRow(row.id, { fiveAreas: areas })}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 達成時期 */}
                      <td style={{ border: '1.5px solid #374151' }} className="p-1 text-center align-middle">
                        <input
                          className="outline-none bg-transparent text-center w-full text-[12px]"
                          style={{ touchAction: 'pan-y' }}
                          value={row.achievementPeriod}
                          onChange={(e) => updateRow(row.id, { achievementPeriod: e.target.value })}
                        />
                      </td>

                      {/* 担当者・提供機関 */}
                      <td style={{ border: '1.5px solid #374151' }} className="p-1 text-center align-middle">
                        <textarea
                          rows={2}
                          className="w-full resize-none outline-none bg-transparent text-[12px] text-center"
                          style={{ touchAction: 'pan-y' }}
                          onWheel={handleWheel}
                          value={row.provider}
                          onChange={(e) => updateRow(row.id, { provider: e.target.value })}
                        />
                      </td>

                      {/* 留意事項 */}
                      <td style={{ border: '1.5px solid #374151' }} className="p-1">
                        <EditCell
                          value={row.notes}
                          onChange={(v) => updateRow(row.id, { notes: v })}
                        />
                      </td>

                      {/* 優先順位 */}
                      <td style={{ border: '1.5px solid #374151' }} className="p-1 text-center align-middle">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            className="outline-none bg-transparent text-center w-full text-[12px] font-bold"
                            style={{ touchAction: 'pan-y' }}
                            value={row.priority}
                            onChange={(e) => updateRow(row.id, { priority: e.target.value })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 行追加ボタン */}
          <div className="flex gap-2 mt-2 print:hidden">
            {(['本人支援', '家族支援', '移行支援'] as SupportCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => addRow(cat)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-primary border border-dashed border-slate-300 hover:border-primary rounded px-2 py-1 transition-colors"
              >
                <Plus size={11} /> {cat}を追加
              </button>
            ))}
          </div>

          {/* 注釈 */}
          <div className="mt-2 text-right text-[10px] text-slate-500">
            ※ 5領域の視点「健康・生活」、「運動・感覚」、「認知・行動」、「言語・コミュニケーション」、「人間関係・社会性」
          </div>

          {/* ===== 確認事項 ===== */}
          <table className="w-full border-collapse mt-2 text-[12px]" style={{ borderLeft: '1.5px solid #374151', borderTop: '1.5px solid #374151' }}>
            <tbody>
              <tr>
                <td
                  className="bg-slate-50 font-medium text-center align-middle p-2 whitespace-nowrap"
                  style={{ border: '1.5px solid #374151', width: '60px' }}
                >
                  確認事項
                </td>
                <td style={{ border: '1.5px solid #374151' }} className="p-1">
                  <textarea
                    rows={2}
                    className="w-full resize-none outline-none bg-transparent text-[12px] leading-relaxed p-1"
                    style={{ touchAction: 'pan-y' }}
                    onWheel={handleWheel}
                    value={plan.confirmation}
                    onChange={(e) => update('confirmation', e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* ===== 説明文 ===== */}
          <div className="flex justify-between mt-3 mb-1 text-[12px]">
            <span>提供する支援内容について、本計画書に基づき説明しました。</span>
            <span>本計画書に基づき支援の説明を受け、内容に同意しました。</span>
          </div>

          {/* ===== 署名欄 ===== */}
          <div className="flex items-end justify-between gap-4 mt-2">
            <div className="flex-1">
              <div className="text-[12px] mb-1">児童発達支援管理責任者氏名：</div>
              <div className="flex items-end gap-2">
                <input
                  className="border-b border-slate-400 outline-none bg-transparent text-sm flex-1 pb-0.5"
                  style={{ touchAction: 'pan-y' }}
                  value={plan.managerName}
                  onChange={(e) => update('managerName', e.target.value)}
                  onBlur={()=>update('managerName',cleanProfessionalManagerName(plan.managerName))}
                  placeholder="氏名を入力"
                />
                <span className="text-sm ml-2">印</span>
                {activeTab !== 'draft' && (
                  <div className="flex items-baseline gap-1 text-[12px] ml-4">
                    <input
                      type="number"
                      className="outline-none bg-transparent w-12 border-b border-slate-400 text-center"
                      style={{ touchAction: 'pan-y' }}
                      value={sy || ''}
                      onChange={(e) => update('signDate', `${e.target.value}-${sm || ''}-${sd || ''}`)}
                      placeholder="年"
                    />
                    <span>年</span>
                    <input
                      type="number"
                      className="outline-none bg-transparent w-8 border-b border-slate-400 text-center"
                      style={{ touchAction: 'pan-y' }}
                      value={sm || ''}
                      onChange={(e) => update('signDate', `${sy || ''}-${e.target.value}-${sd || ''}`)}
                      placeholder="月"
                    />
                    <span>月</span>
                    <input
                      type="number"
                      className="outline-none bg-transparent w-8 border-b border-slate-400 text-center"
                      style={{ touchAction: 'pan-y' }}
                      value={sd || ''}
                      onChange={(e) => update('signDate', `${sy || ''}-${sm || ''}-${e.target.value}`)}
                      placeholder="日"
                    />
                    <span>日</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1">
              <div className="text-[12px] mb-1 text-right">（保護者署名）</div>
              <input
                className="border-b border-slate-400 outline-none bg-transparent text-sm w-full text-right pb-0.5"
                style={{ touchAction: 'pan-y' }}
                value={plan.guardianName}
                onChange={(e) => update('guardianName', e.target.value)}
                placeholder=""
              />
            </div>
          </div>
        </div>
      )}

      {/* ======== 書類本体：個別支援計画別表（利用時間） ======== */}
      {activeTab === 'hours' && hoursPlan && isPeriodStatusMatch && (
        <div className="bg-white border border-slate-300 shadow-sm p-6 print:shadow-none print:border-0 print:p-0" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
          {documentControls}
          {/* ===== ヘッダー ===== */}
          <div className="hidden print:flex items-start justify-between mb-4">
            <div className="text-left">
              <h1 className="text-xl font-black tracking-wide">個別支援計画別表</h1>
            </div>
            <div className="flex items-baseline gap-1 text-sm">
              <span className="whitespace-nowrap">利用児氏名：</span>
              <div className="border-b border-slate-400 min-w-[160px] px-1 text-center font-bold">
                {selectedChild.fullName}
              </div>
              <span className="ml-1">様</span>
            </div>
            <div className="text-sm flex items-baseline gap-1 whitespace-nowrap">
              <span>作成日：</span>
              <input
                type="number"
                className="outline-none bg-transparent w-12 border-b border-slate-400 text-center"
                value={cy || ''}
                onChange={(e) => setHoursPlan(prev => prev ? { ...prev, createdAt: `${e.target.value}-${cm || ''}-${cd || ''}` } : prev)}
                placeholder="年"
              />
              <span>年</span>
              <input
                type="number"
                className="outline-none bg-transparent w-8 border-b border-slate-400 text-center"
                value={cm || ''}
                onChange={(e) => setHoursPlan(prev => prev ? { ...prev, createdAt: `${cy || ''}-${e.target.value}-${cd || ''}` } : prev)}
                placeholder="月"
              />
              <span>月</span>
              <input
                type="number"
                className="outline-none bg-transparent w-8 border-b border-slate-400 text-center"
                value={cd || ''}
                onChange={(e) => setHoursPlan(prev => prev ? { ...prev, createdAt: `${cy || ''}-${cm || ''}-${e.target.value}` } : prev)}
                placeholder="日"
              />
              <span>日</span>
            </div>
          </div>

          {/* ===== 曜日スケジュールテーブル ===== */}
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-xs table-fixed" style={{ borderLeft: '1.5px solid #374151', borderTop: '1.5px solid #374151' }}>
              <thead>
                <tr className="bg-slate-100 text-center">
                  <th style={{ border: '1.5px solid #374151', width: '120px' }} className="p-2 font-bold">区分</th>
                  <th style={{ border: '1.5px solid #374151', width: '120px' }} className="p-2 font-bold">時間帯 / 合計</th>
                  {['月', '火', '水', '木', '金', '土', '日'].map(day => (
                    <th key={day} style={{ border: '1.5px solid #374151' }} className="p-2 font-bold">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* --- 提供時間 --- */}
                <tr>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 font-bold p-2 text-center align-middle" rowSpan={2}>
                    提供時間
                  </td>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 p-2 text-center font-semibold">
                    利用開始・終了時間
                  </td>
                  {['月', '火', '水', '木', '金', '土', '日'].map(day => {
                    const sched = hoursPlan.weeklyHours[day] || defaultDaySchedule();
                    return (
                      <td key={day} style={{ border: '1.5px solid #374151' }} className="p-1 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <input
                            type="text"
                            placeholder=""
                            className="w-12 text-center border-b border-slate-200 outline-none focus:border-primary text-xs"
                            value={sched.startTime || ''}
                            onChange={(e) => updateDaySchedule(day, { startTime: e.target.value })}
                          />
                          <span className="text-slate-400">{sched.startTime || sched.endTime ? '~' : ''}</span>
                          <input
                            type="text"
                            placeholder=""
                            className="w-12 text-center border-b border-slate-200 outline-none focus:border-primary text-xs"
                            value={sched.endTime || ''}
                            onChange={(e) => updateDaySchedule(day, { endTime: e.target.value })}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 p-2 text-center font-semibold">
                    合計時間
                  </td>
                  {['月', '火', '水', '木', '金', '土', '日'].map(day => {
                    const sched = hoursPlan.weeklyHours[day] || defaultDaySchedule();
                    return (
                      <td key={day} style={{ border: '1.5px solid #374151' }} className="p-2 text-center font-bold text-slate-700 bg-slate-50/30">
                        {sched.startTime || sched.endTime ? formatMinutes(sched.totalMinutes) : ''}
                      </td>
                    );
                  })}
                </tr>

                {/* --- 延長支援時間 --- */}
                <tr>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 font-bold p-2 text-center align-middle leading-tight" rowSpan={3}>
                    延長支援時間<br />
                    <span className="text-[9px] font-normal text-slate-500">※延長支援時間は、支援前・支援後それぞれ1時間以上から</span>
                  </td>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 p-2 text-center font-semibold">
                    【支援前】延長支援時間
                  </td>
                  {['月', '火', '水', '木', '金', '土', '日'].map(day => {
                    const sched = hoursPlan.weeklyHours[day] || defaultDaySchedule();
                    return (
                      <td key={day} style={{ border: '1.5px solid #374151' }} className="p-1 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <input
                            type="text"
                            placeholder=""
                            className="w-12 text-center border-b border-slate-200 outline-none focus:border-primary text-xs"
                            value={sched.beforeExtStartTime || ''}
                            onChange={(e) => updateDaySchedule(day, { beforeExtStartTime: e.target.value })}
                          />
                          <span className="text-slate-400">{sched.beforeExtStartTime || sched.beforeExtEndTime ? '~' : ''}</span>
                          <input
                            type="text"
                            placeholder=""
                            className="w-12 text-center border-b border-slate-200 outline-none focus:border-primary text-xs"
                            value={sched.beforeExtEndTime || ''}
                            onChange={(e) => updateDaySchedule(day, { beforeExtEndTime: e.target.value })}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 p-2 text-center font-semibold">
                    【支援後】延長支援時間
                  </td>
                  {['月', '火', '水', '木', '金', '土', '日'].map(day => {
                    const sched = hoursPlan.weeklyHours[day] || defaultDaySchedule();
                    return (
                      <td key={day} style={{ border: '1.5px solid #374151' }} className="p-1 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <input
                            type="text"
                            placeholder=""
                            className="w-12 text-center border-b border-slate-200 outline-none focus:border-primary text-xs"
                            value={sched.afterExtStartTime || ''}
                            onChange={(e) => updateDaySchedule(day, { afterExtStartTime: e.target.value })}
                          />
                          <span className="text-slate-400">{sched.afterExtStartTime || sched.afterExtEndTime ? '~' : ''}</span>
                          <input
                            type="text"
                            placeholder=""
                            className="w-12 text-center border-b border-slate-200 outline-none focus:border-primary text-xs"
                            value={sched.afterExtEndTime || ''}
                            onChange={(e) => updateDaySchedule(day, { afterExtEndTime: e.target.value })}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 p-2 text-center font-semibold">
                    延長時間合計
                  </td>
                  {['月', '火', '水', '木', '金', '土', '日'].map(day => {
                    const sched = hoursPlan.weeklyHours[day] || defaultDaySchedule();
                    const totalExt = sched.beforeExtMinutes + sched.afterExtMinutes;
                    return (
                      <td key={day} style={{ border: '1.5px solid #374151' }} className="p-2 text-center font-bold text-slate-700 bg-slate-50/30">
                        {sched.beforeExtStartTime || sched.beforeExtEndTime || sched.afterExtStartTime || sched.afterExtEndTime ? formatMinutes(totalExt) : ''}
                      </td>
                    );
                  })}
                </tr>

                {/* --- 延長を必要とする理由 --- */}
                <tr>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 font-bold p-2 text-center align-middle">
                    延長を必要とする理由
                  </td>
                  <td style={{ border: '1.5px solid #374151' }} className="p-2" colSpan={8}>
                    <textarea
                      rows={3}
                      className="w-full resize-none outline-none bg-transparent text-xs leading-relaxed p-1"
                      style={{ touchAction: 'pan-y' }}
                      onWheel={handleWheel}
                      value={hoursPlan.extReason || ''}
                      onChange={(e) => updateHoursPlanField('extReason', e.target.value)}
                      placeholder="延長支援を必要とする理由を入力してください"
                    />
                  </td>
                </tr>

                {/* --- 特記事項 --- */}
                <tr>
                  <td style={{ border: '1.5px solid #374151' }} className="bg-slate-50 font-bold p-2 text-center align-middle">
                    特記事項
                  </td>
                  <td style={{ border: '1.5px solid #374151' }} className="p-2" colSpan={8}>
                    <textarea
                      rows={3}
                      className="w-full resize-none outline-none bg-transparent text-xs leading-relaxed p-1"
                      style={{ touchAction: 'pan-y' }}
                      onWheel={handleWheel}
                      value={hoursPlan.notes || ''}
                      onChange={(e) => updateHoursPlanField('notes', e.target.value)}
                      placeholder="特記事項があれば入力してください"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* データがステータス不一致または存在しない場合のプレースホルダー */}
      {!isPeriodStatusMatch && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center text-slate-400">
          {documentControls}
          {showArchived 
            ? 'アーカイブされた書類はありません。' 
            : 'この月はアーカイブされています。「アーカイブを見る」をONにしてご覧ください。'}
        </div>
      )}

      {managerSettingsOpen&&<ProfessionalManagerSettings key={selectedOfficeId} officeId={selectedOfficeId} officeName={officeName} currentName={plan?.managerName} onSaved={(name,apply)=>{if(apply)setPlan(previous=>previous?{...previous,managerName:name}:previous);}} onClose={()=>setManagerSettingsOpen(false)}/>}
      {/* インポートモーダル */}
      <ProfessionalPlanImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportComplete}
        childId={childId || ''}
      />

      {transferDirection&&<DocumentTransferModal scope={{book:'professional',officeId:selectedOfficeId,month:currentMonth,children:childrenData,childId}} officeName={officeName} direction={transferDirection} beforeTransfer={()=>autoSaver.current!.flushAll()} onImported={async()=>{await fetchAvailableMonths();await fetchData();onReload?.();}} onClose={()=>setTransferDirection(null)} onExcel={transferDirection==='export'?()=>void handleExcelExport():()=>setIsImportOpen(true)}/>}
      {exportDocuments&&<ProfessionalPlanExportSettings documents={exportDocuments} childName={selectedChild.fullName} month={currentMonth} onClose={()=>setExportDocuments(null)}/>}
      {printDocuments && <SupportImplementationPrintSettings professionalDocuments={printDocuments} onClose={()=>setPrintDocuments(null)} />}

    </div>
  );
};
