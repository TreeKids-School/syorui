import {measureReads} from './readDiagnostics';
import {resolveStaffColor} from './staffColor';
import {collection, doc, documentId, getDoc as firestoregetDoc, getDocs as firestoregetDocs, query, where} from 'firebase/firestore';
const getDocs=measureReads('児童切替・出席と担当',firestoregetDocs);
const getDoc=measureReads('児童切替・出席と担当',firestoregetDoc);

import {auth, db} from './firebase';
import type {SummaryChildOrder} from './summaryChildOrder';

type OrderData = {reports: {id: string; data: any}[]; assignedStaff: Record<string, string>; staff: {id: string; name: string; color?: string}[]};
const pending = new Map<string, Promise<OrderData>>();
export function loadChildListOrderData(officeId: string, today: string, order: SummaryChildOrder): Promise<OrderData> {
  const kind = order === 'today' ? 'today' : order.startsWith('attendance-') ? 'month' : order === 'staff' ? 'staff' : 'none';
  if (kind === 'none') return Promise.resolve({reports: [], assignedStaff: {}, staff: []});
  const month = today.slice(0, 7);
  const key = `${auth.currentUser?.uid}:${officeId}:${kind}:${kind === 'today' ? today : month}`;
  if (!pending.has(key)) {
    const request = (async (): Promise<OrderData> => {
      if (kind === 'staff') {
        const [assigned, staff] = await Promise.all([
          getDoc(doc(db, 'offices', officeId, 'monthly_staff_assignments', month)),
          getDocs(collection(db, 'staff')),
        ]);
        return {reports: [], assignedStaff: assigned.exists() ? assigned.data().assignments || {} : {},
          staff: staff.docs.filter(member=>{const value=member.data();return !(value.archived===true||value.isArchived===true||value.status==='archived'||value.isDeleted===true||value.deleted===true||value.active===false)&&(!value.officeId||value.officeId===officeId||(Array.isArray(value.officeIds)&&value.officeIds.includes(officeId)));}).map((member,index) => {const value=member.data();return {id: member.id, name: value.name || value.fullName || member.id, color: resolveStaffColor(value.color || value.staffColor || value.themeColor || value.userColor || value.iconColor || value.avatarColor,index)};})};
      }
      if (kind === 'today') {
        const snapshots = await Promise.all(['', `${officeId}_`].map(prefix => getDoc(doc(db, 'reports', `${prefix}${today}`))));
        return {reports: snapshots.filter(snapshot => snapshot.exists()).map(snapshot => ({id: snapshot.id, data: snapshot.data()})), assignedStaff: {}, staff: []};
      }
      const snapshots = await Promise.all(['', `${officeId}_`].map(prefix => getDocs(query(collection(db, 'reports'),
        where(documentId(), '>=', `${prefix}${month}-01`), where(documentId(), '<=', `${prefix}${month}-31`)))));
      return {reports: snapshots.flatMap(snapshot => snapshot.docs.map(report => ({id: report.id, data: report.data()}))), assignedStaff: {}, staff: []};
    })();
    pending.set(key, request);
    void request.then(() => pending.delete(key), () => pending.delete(key));
  }
  return pending.get(key)!;
}
