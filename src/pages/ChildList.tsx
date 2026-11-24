import {DropdownSelect} from '../components/ui/DropdownSelect';
import {StaffAccountContext} from '../components/StaffAccountBadge';
import {auth} from '../lib/firebase';
import {filterSummaryStaff,resolveOwnStaffId} from '../lib/summaryStaffFilter';
import React, {useEffect, useMemo, useState} from 'react';
import {orderSummaryChildren, japanDateKey} from '../lib/summaryChildOrder';
import type {SummaryChildOrder} from '../lib/summaryChildOrder';
import {loadChildListOrderData} from '../lib/childListOrderData';
import {officeAttendanceDates} from '../lib/supportOfficeAttendance';
import {describeReadError} from '../lib/readError';
import { ArrowLeft } from 'lucide-react';
import { NavLink, useOutletContext } from 'react-router-dom';
import type { Child } from '../data/mockData';

type ChildListProps = {
  childrenData: Child[];
  selectedOfficeId: string;
  offices: { id: string; name: string }[];
  onOfficeChange: (id: string) => void;
};

export const ChildList: React.FC<ChildListProps> = ({ childrenData, selectedOfficeId }) => {
  const {childOrder, setVisibleMobileChildren} = useOutletContext<{
    childOrder: SummaryChildOrder;
    setVisibleMobileChildren: (value: {scope: string; ids: string[]}) => void;
  }>();
  const account=React.useContext(StaffAccountContext);
  const [staffFilter,setStaffFilter]=useState('mine');
  const [staffData,setStaffData]=useState<{key:string;data:Awaited<ReturnType<typeof loadChildListOrderData>>}|null>(null);
  const [staffError,setStaffError]=useState('');
  const [today, setToday] = useState(() => japanDateKey());
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [retry, setRetry] = useState(0);
  const [orderData, setOrderData] = useState<{key: string; data: Awaited<ReturnType<typeof loadChildListOrderData>>} | null>(null);
  const [readError, setReadError] = useState<{key: string; message: string} | null>(null);
  const readKey = `${selectedOfficeId}:${today}:${childOrder}`;
  const needsRead = childOrder === 'today' || childOrder === 'staff' || childOrder.startsWith('attendance-');
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const change = () => setIsMobile(media.matches);
    media.addEventListener('change', change);
    const timer = window.setInterval(() => setToday(japanDateKey()), 60_000);
    return () => { media.removeEventListener('change', change); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!isMobile || !needsRead) return;
    let cancelled = false;
    setReadError(null);
    loadChildListOrderData(selectedOfficeId, today, childOrder).then(data => {
      if (!cancelled) setOrderData({key: readKey, data});
    }).catch(error => {
      if (!cancelled) setReadError({key: readKey, message: describeReadError(error)});
    });
    return () => { cancelled = true; };
  }, [selectedOfficeId, today, childOrder, readKey, needsRead, isMobile, retry]);
  const staffKey=selectedOfficeId+':'+today.slice(0,7);
  const staffInfo=staffData?.key===staffKey?staffData.data:childOrder==='staff'&&orderData?.key===readKey?orderData.data:null;
  useEffect(()=>{
    if(!isMobile||staffFilter==='all'||staffInfo)return;
    let cancelled=false;setStaffError('');
    loadChildListOrderData(selectedOfficeId,today,'staff').then(data=>{if(!cancelled)setStaffData({key:staffKey,data});}).catch(error=>{if(!cancelled)setStaffError(describeReadError(error));});
    return()=>{cancelled=true;};
  },[isMobile,staffFilter,staffInfo,selectedOfficeId,today,staffKey,retry]);
  const orderedChildren = useMemo(() => {
    const data = orderData?.key === readKey ? orderData.data : null;
    const month = today.slice(0, 7);
    const todayKey = `${Number(today.slice(5, 7))}月${Number(today.slice(8, 10))}日`;
    const attendingToday = new Set<string>();
    const attendanceCounts: Record<string, {attendanceCount: number}> = {};
    for (const child of childrenData) {
      if (!child.id) continue;
      const dates = officeAttendanceDates(data?.reports || [], child, selectedOfficeId, month);
      if (dates.has(todayKey)) attendingToday.add(child.id);
      attendanceCounts[child.id] = {attendanceCount: dates.size};
    }
    const visibleChildren = childOrder === 'today' ? childrenData.filter(child => child.id && attendingToday.has(child.id)) : childrenData;
    const ordered=orderSummaryChildren(visibleChildren, childOrder, {
      assignedStaff: data?.assignedStaff || {}, staff: data?.staff || [], attendingToday, attendanceCounts,
    });
    return filterSummaryStaff(ordered,staffInfo?.assignedStaff||{},staffFilter,resolveOwnStaffId(staffInfo?.staff||[],auth.currentUser?.uid||'',account.name));
  }, [childrenData, childOrder, orderData, readKey, selectedOfficeId, today,staffInfo,staffFilter,account.name]);
  const error = (readError?.key === readKey ? readError.message : '')||(staffFilter!=='all'?staffError:'');
  const loading = isMobile && ((needsRead && orderData?.key !== readKey)||(staffFilter!=='all'&&!staffInfo)) && !error;
  useEffect(() => {
    setVisibleMobileChildren({scope: `${selectedOfficeId}:${today}`, ids: !loading && !error ? orderedChildren.flatMap(child => child.id ? [child.id] : []) : []});
  }, [selectedOfficeId, today, loading, error, orderedChildren, setVisibleMobileChildren]);
  return (
    <>
    <section className="md:hidden space-y-4">
      <DropdownSelect label="担当の表示" value={staffFilter} onChange={setStaffFilter} options={[{value:'all',label:'すべての児童'},{value:'mine',label:'自分の担当児童のみ'},{value:'unassigned',label:'担当未設定の児童'},...(staffInfo?.staff||[]).map(member=>({value:'staff:'+member.id,label:member.name+'の担当児童'}))]}/>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">並べ替え情報を読み込めませんでした。{error}<button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">再試行</button></div>}
      {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500">児童一覧を読み込み中…</p> : <div className="space-y-2">
        {orderedChildren.map(child => (
          <NavLink key={child.id} to={`/children/${child.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-100">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{child.imageKey || child.fullName?.[0] || '?'}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-slate-800">{child.fullName || '(名前なし)'}</span>
              <span className="block text-xs text-slate-500">{child.schoolName}</span>
            </span>
          </NavLink>
        ))}
        {!error && orderedChildren.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{childOrder === 'today' ? '本日出席予定の児童はいません。' : '登録されている児童はいません。'}</p>}
      </div>}
    </section>
    <div className="hidden md:flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="glass-panel p-12 flex flex-col items-center gap-6 max-w-md text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
          <ArrowLeft size={40} className="animate-pulse-slow" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">児童を選択してください</h2>
        <p className="text-slate-500 leading-relaxed">
          実施状況表の児童名から書類を選択して、<br />
          書類の作成や確認を始めてください。
        </p>
        <NavLink to="/monthly-summary" className="rounded-xl bg-primary px-4 py-2 text-white">実施状況表を開く</NavLink>
      </div>
    </div>
    </>
  );
};

