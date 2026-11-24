import {OfficeNavigationContext} from './components/OfficeNavigationContext';
import {setAuditActor,setAuditChildren} from './lib/documentAudit';
import {getMonitoringPlans} from './lib/monitoringPlans';
import {measureRead} from './lib/readDiagnostics';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocsFromServer, getDocFromServer, doc, query } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { Layout } from './components/Layout';
import { ChildList } from './pages/ChildList';
import { ChildDashboard } from './pages/ChildDashboard';
import { SupportImplementation } from './pages/SupportImplementation';
import { ProfessionalPerspective } from './pages/ProfessionalPerspective';
import { Login } from './pages/Login';
import { MonthlySummary } from './pages/MonthlySummary';
import { ForceSheet } from './pages/ForceSheet';
import type { Child } from './data/mockData';
import { matchesOffice, resolveChildOffices } from './lib/officeUtils';
import {describeReadError} from './lib/readError';
import {isArchivedChild} from './lib/childArchive';
import {resolveStaffAccount} from './lib/staffAccount';
import {StaffAccountContext} from './components/StaffAccountBadge';
import './index.css';

const COLLECTION_NAME = 'children';


// ---- 認証済みアプリ本体 ----
function AppContent({ user }: { user: User }) {
  const [staffAccount, setStaffAccount] = useState(() => resolveStaffAccount({}, user.displayName || ''));
  useEffect(()=>setAuditActor(user.uid,staffAccount.name,staffAccount.color),[user.uid,staffAccount]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('LNrWc8f6G703aUYRZ5e2'); // デフォルト: Search
  const [showAssignedOnlyByDefault,setShowAssignedOnlyByDefault]=useState(true);
  const changeOffice=(id:string)=>{if(!offices.some(office=>office.id===id))return;setShowAssignedOnlyByDefault(false);setSelectedOfficeId(id);};
  const [offices, setOffices] = useState<{ id: string, name: string }[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  useEffect(()=>setAuditChildren(children),[children]);
  const [allPlans, setAllPlans] = useState<any[]>([]);
  const [readError, setReadError] = useState('');
  const [officeInitialized,setOfficeInitialized]=useState(false);
  const [officeReadError, setOfficeReadError] = useState('');
  const [hasLoadedChildren, setHasLoadedChildren] = useState(false);
  const childLoadInFlight = useRef(false);
  const officeLoadInFlight = useRef(false);

  // 初期ロード：事業所一覧の取得と、ログインスタッフの所属事業所を初期選択とする
  const initOffice = useCallback(async () => {
      if (officeLoadInFlight.current) return;
      officeLoadInFlight.current = true;
      setOfficeReadError('');
      try {
        const oSnap = await getDocsFromServer(query(collection(db, 'offices')));
        const oList = oSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
        setOffices(oList);

        if (user) {
          const staffDoc = await getDocFromServer(doc(db, 'staff', user.uid));
          setStaffAccount(resolveStaffAccount(staffDoc.exists() ? staffDoc.data() : {}, user.displayName || ''));
          const foundStaffOfficeId = staffDoc.exists() ? staffDoc.data().officeId || '' : '';
          if (foundStaffOfficeId) {
            setSelectedOfficeId(foundStaffOfficeId);
          }
        }
      } catch (err) {
        console.error("Failed to init office data:", err);
        setOfficeReadError(describeReadError(err));
      } finally {
        officeLoadInFlight.current = false;
        setOfficeInitialized(true);
      }
  }, [user]);
  useEffect(() => { void initOffice(); }, [initOffice]);

  const fetchChildrenAndPlans = useCallback(async () => {
    if (childLoadInFlight.current) return;
    childLoadInFlight.current = true;
    setReadError('');
    try {
      const q = query(collection(db, COLLECTION_NAME));
      const snapshot = await measureRead('起動時の児童一覧',getDocsFromServer(q));
      const childList = snapshot.docs.map(d => {
        const fd = d.data();

        // 姓名の解決 (旧形式: fullName, name / 新形式: lastName, firstName)
        let resolvedName = '';
        if (fd.fullName && typeof fd.fullName === 'string' && fd.fullName.trim()) {
          resolvedName = fd.fullName.trim();
        } else if (fd.name && typeof fd.name === 'string' && fd.name.trim()) {
          resolvedName = fd.name.trim();
        } else if (fd.lastName || fd.firstName) {
          resolvedName = `${fd.lastName || ''} ${fd.firstName || ''}`.trim();
        }

        // ふりがなの解決 (旧形式: nameKana, nameFurigana / 新形式: lastNameFurigana, firstNameFurigana)
        let resolvedKana = '';
        if (fd.nameKana && typeof fd.nameKana === 'string' && fd.nameKana.trim()) {
          resolvedKana = fd.nameKana.trim();
        } else if (fd.nameFurigana && typeof fd.nameFurigana === 'string' && fd.nameFurigana.trim()) {
          resolvedKana = fd.nameFurigana.trim();
        } else if (fd.lastNameFurigana || fd.firstNameFurigana) {
          resolvedKana = `${fd.lastNameFurigana || ''} ${fd.firstNameFurigana || ''}`.trim();
        }

        // 年齢の解決 (age または birthDate / birthdate からの算出)
        let resolvedAge = Number(fd.age) || 0;
        const bDateStr = fd.birthDate || fd.birthdate;
        if (!resolvedAge && bDateStr) {
          const birth = new Date(bDateStr);
          if (!isNaN(birth.getTime())) {
            const today = new Date();
            let calcAge = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
              calcAge--;
            }
            resolvedAge = calcAge > 0 ? calcAge : 0;
          }
        }

        // 保護者勤務先の解決
        const workplaceInfo = [
          fd.workplace1Name ? `${fd.workplace1Name}${fd.workplace1Contact ? ` (${fd.workplace1Contact})` : ''}` : '',
          fd.workplace2Name ? `${fd.workplace2Name}${fd.workplace2Contact ? ` (${fd.workplace2Contact})` : ''}` : ''
        ].filter(Boolean).join(' / ');

        return {
          id: d.id,
          fullName: resolvedName || '(名前なし)',
          nameKana: resolvedKana,
          age: resolvedAge,
          grade: fd.grade || fd.schoolGrade || '',
          schoolName: fd.schoolName || fd.school || '',
          address: fd.address || '',
          phoneNumberHome: fd.phoneNumberHome || fd.phoneNumber || '',
          phoneNumberEmergency: fd.phoneNumberEmergency || fd.contact1Phone || fd.contact2Phone || '',
          parentWorkplaceContact: fd.parentWorkplaceContact || workplaceInfo,
          familyStructure: fd.familyStructure || '',
          features: fd.features || [],
          imageKey: fd.imageKey || (resolvedName ? resolvedName[0] : '?'),
          offices: resolveChildOffices(fd),
          archived: isArchivedChild(fd),
          currentPlanEndMonth: fd.currentPlanEndMonth || '',
          serviceType: fd.serviceType || '',
          serviceCategory: fd.serviceCategory || '',
          isHoukagoDay: typeof fd.isHoukagoDay === 'boolean' ? fd.isHoukagoDay : undefined,
        };
      }) as Child[];

      // 通知用の本案は事業所単位の別処理で取得し、児童一覧を巻き込まない。
      setChildren(childList);
      setHasLoadedChildren(true);

    } catch (error) {
      console.error('[AppContent] Fetch error:', error);
      setReadError(describeReadError(error));
    } finally {
      childLoadInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetchChildrenAndPlans();
  }, [fetchChildrenAndPlans]);



  const refreshMonitoring=useCallback(async(refresh=false)=>{
    if(!officeInitialized)return;
    try{const plans=await getMonitoringPlans(selectedOfficeId,refresh);setAllPlans(plans);}catch(error){setReadError(describeReadError(error));}
  },[selectedOfficeId,officeInitialized]);
  useEffect(()=>{let cancelled=false;if(officeInitialized)getMonitoringPlans(selectedOfficeId).then(plans=>{if(!cancelled)setAllPlans(plans);}).catch(error=>{if(!cancelled)setReadError(describeReadError(error));});return()=>{cancelled=true;};},[selectedOfficeId,officeInitialized]);
  // モニタリング通知判定ヘルパー
  const checkNeedsMonitoring = (childId: string) => {
    const childPlans = allPlans.filter(p => p.childId === childId && p.officeId === selectedOfficeId && p.archived !== true);
    if (childPlans.length === 0) return false;

    const months = childPlans.map(p => p.startMonth).filter(Boolean).sort();
    if (months.length === 0) return false;

    const latestStartMonth = months[months.length - 1];
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;

    const [startYear, startMonthVal] = latestStartMonth.split('-').map(Number);
    if (!startYear || !startMonthVal) return false;

    const diffMonths = (curYear - startYear) * 12 + (curMonth - startMonthVal);

    if (diffMonths >= 5) {
      const hasNextPeriod = childPlans.some(p => {
        const pMonth = p.startMonth;
        if (!pMonth) return false;
        const [py, pm] = pMonth.split('-').map(Number);
        const pDiff = (py - startYear) * 12 + (pm - startMonthVal);
        return pDiff >= 6;
      });
      return !hasNextPeriod;
    }
    return false;
  };

  const filteredChildren = useMemo(() => children
    .filter(child => {
      const childOffices = child.offices;
      if (!childOffices || (Array.isArray(childOffices) && childOffices.length === 0)) {
        return selectedOfficeId === 'LNrWc8f6G703aUYRZ5e2';
      }
      return matchesOffice(selectedOfficeId, childOffices);
    })
    .map(child => ({
      ...child,
      needsMonitoring: child.id ? checkNeedsMonitoring(child.id) : false
    })), [children, allPlans, selectedOfficeId]);

  if (!hasLoadedChildren) return <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
    <section className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700" role={readError ? 'alert' : 'status'}>
      <h1 className="text-lg font-bold">{readError ? '児童一覧を読み込めませんでした' : '児童一覧を読み込み中…'}</h1>
      {readError && <><p className="text-sm leading-relaxed">{readError}</p><button type="button" onClick={() => { void initOffice(); void fetchChildrenAndPlans(); }} className="rounded-xl bg-primary px-4 py-2 font-semibold text-white">再読み込み</button></>}
    </section>
  </div>;

  return (
    <>
    {readError && <div role="alert" className="fixed inset-x-4 top-4 z-[10000] rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{readError}<button type="button" className="ml-4 underline" onClick={() => {void fetchChildrenAndPlans();void refreshMonitoring(true);}}>再試行</button></div>}
    {!readError && officeReadError && <div role="alert" className="fixed inset-x-4 top-4 z-[10000] rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">事業所情報を読み込めませんでした。{officeReadError}<button type="button" className="ml-4 underline" onClick={() => void initOffice()}>再試行</button></div>}
    <StaffAccountContext.Provider value={staffAccount}>
    <OfficeNavigationContext.Provider value={{children,offices,showAssignedOnlyByDefault,onOfficeChange:changeOffice}}>
    <Routes>
      <Route element={
        <Layout 
          childrenData={filteredChildren} 
          selectedOfficeId={selectedOfficeId}
        />
      }>
        <Route path="/" element={<ChildList key={selectedOfficeId} childrenData={filteredChildren} selectedOfficeId={selectedOfficeId} offices={offices} onOfficeChange={changeOffice} />} />
        <Route path="/monthly-summary" element={
          <MonthlySummary 
            key={selectedOfficeId}
            childrenData={filteredChildren} 
            onOfficeChange={changeOffice}
            selectedOfficeId={selectedOfficeId} 
            offices={offices} 
          />
        } />
        <Route path="/children/:childId" element={
          <ChildDashboard 
            childrenData={children} 
            selectedOfficeId={selectedOfficeId}
            onOfficeChange={changeOffice}
            offices={offices}
          />
        } />
        <Route path="/children/:childId/professional-perspective" element={
          <ProfessionalPerspective 
            childrenData={filteredChildren} 
            selectedOfficeId={selectedOfficeId} 
            offices={offices}
            onReload={()=>void refreshMonitoring(true)}
          />
        } />
        <Route path="/children/:childId/support-plan/:month?" element={
          <SupportImplementation 
            key={selectedOfficeId}
            childrenData={filteredChildren} 
            selectedOfficeId={selectedOfficeId} 
            offices={offices}
          />
        } />
        <Route path="/children/:childId/force-sheet" element={
          <ForceSheet 
            childrenData={filteredChildren} 
            selectedOfficeId={selectedOfficeId} 
            offices={offices} 
          />
        } />
        <Route path="/settings" element={<Navigate to="/monthly-summary" replace />} />

      </Route>

      {/* 未マッチはトップへ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </OfficeNavigationContext.Provider>
    </StaffAccountContext.Provider>
    </>
  );
}

// ---- ルートコンポーネント（認証ゲート） ----
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AppContent user={user} />;
}

export default App;
