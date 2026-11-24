import type {DailyReport} from '../types/supportPlan';
import {excelExportOfficePriority} from './excelExportOfficeScope';
import {supportDateKey} from './supportOfficeAttendance';

type SourceRecord = {id: string; data: any};
const nonempty = (value: unknown): string => typeof value === 'string' && value.trim() ? value : '';
export const resolveSupportFuturePlan = (saved: unknown, fallback: unknown) => nonempty(saved) || nonempty(fallback);
const time = (value: any) => value?.toMillis?.() || (typeof value === 'string' ? Date.parse(value) || 0 : 0);

/** 画面とExcelで同じ、対象事業所・出席日限定の予定補完を行う。 */
export function collectOfficeFuturePlans(reports: SourceRecord[], treeCommunications: SourceRecord[],
  child: {id?: string; offices?: string[]}, officeId: string, month: string, attendance: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  const latest: Record<string, {priority: number; time: number}> = {};
  const add = (record: SourceRecord, value: unknown, childData?: any) => {
    const date = supportDateKey(record.id.match(/(\d{4}-\d{2}-\d{2})$/)?.[1], month);
    const priority = excelExportOfficePriority(record.data, record.id, child, officeId, month);
    const text = nonempty(value);
    if (!date || !attendance.has(date) || !priority || !text) return;
    if ((childData?.officeId || childData?.office) && !excelExportOfficePriority(childData, record.id, child, officeId, month)) return;
    const updated = time(record.data.updatedAt || record.data.createdAt);
    const old = latest[date];
    if (old && (old.priority > priority || (old.priority === priority && old.time > updated))) return;
    result[date] = text;
    latest[date] = {priority, time: updated};
  };
  for (const record of reports) {
    const data = record.data.results?.[child.id!];
    if (data) add(record, nonempty(data.futurePlan) || data.future_plan, data);
  }
  for (const record of treeCommunications) add(record, nonempty(record.data.future_plan) || record.data.futurePlan);
  return result;
}

export function supplementSupportFutureRows(rows: DailyReport[], futures: Record<string, string>, attendance: Set<string>, childId: string, month: string): DailyReport[] {
  const dates = new Set<string>();
  const result = rows.flatMap(row => {
    const date = supportDateKey(row.date, month);
    if (!date || !attendance.has(date)) return [];
    dates.add(date);
    return [{...row, date, content: {...row.content, futurePlan: resolveSupportFuturePlan(row.content?.futurePlan, futures[date])}}];
  });
  // 画面に表示される、日報未作成だが予定のある仮想行も同じように出力する。
  for (const [date, futurePlan] of Object.entries(futures)) {
    if (dates.has(date) || !attendance.has(date) || !nonempty(futurePlan)) continue;
    result.push({childId, planMonth: month, date, staffId: '', type: 'tree_report', archived: false,
      content: {externalInfo: '', supportContent: [], resultInfo: '', futurePlan}, createdAt: '', updatedAt: ''});
  }
  return result;
}
