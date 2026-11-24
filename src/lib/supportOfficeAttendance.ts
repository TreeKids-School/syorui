import {excelExportOfficePriority} from './excelExportOfficeScope';

export function supportDateKey(value: any, month: string): string | null {
  const [year, monthNumber] = month.split('-').map(Number);
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date.getFullYear() === year && date.getMonth() + 1 === monthNumber ? `${monthNumber}月${date.getDate()}日` : null;
  }
  if (typeof value !== 'string') return null;
  const full = value.trim().match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|T.*)?$/);
  const short = value.trim().match(/^(\d{1,2})月(\d{1,2})日$/);
  if (!full && !short) return null;
  const y = full ? Number(full[1]) : year;
  const m = Number(full ? full[2] : short![1]);
  const day = Number(full ? full[3] : short![2]);
  const date = new Date(y, m - 1, day);
  return y === year && m === monthNumber && date.getMonth() + 1 === m && date.getDate() === day ? `${m}月${day}日` : null;
}

/** 保存済み療育記録のofficeIdを出席の代用にせず、選択事業所の出席予定で対象日を決める。 */
export function officeAttendanceDates(records: {id: string; data: any}[], child: {id?: string; offices?: string[]}, officeId: string, month: string): Set<string> {
  const byDate = new Map<string, {priority: number; attending: boolean}>();
  for (const record of records) {
    const date = supportDateKey(record.id.match(/(\d{4}-\d{2}-\d{2})$/)?.[1], month);
    const priority = excelExportOfficePriority(record.data, record.id, child, officeId, month);
    if (!date || !priority) continue;
    const entry = Array.isArray(record.data.children) ? record.data.children.find((item: any) => item?.id === child.id) : null;
    if (!entry) continue;
    const table = record.data.dailyTable?.[child.id!];
    if ((entry.officeId || entry.office) && !excelExportOfficePriority(entry, record.id, child, officeId, month)) continue;
    if ((table?.officeId || table?.office) && !excelExportOfficePriority(table, record.id, child, officeId, month)) continue;
    if ((byDate.get(date)?.priority || 0) > priority) continue;
    byDate.set(date, {priority, attending: !entry.isAbsent && !entry.isWaitlist && !table?.isAbsent && !table?.isWaitlist});
  }
  return new Set([...byDate].filter(([, entry]) => entry.attending).map(([date]) => date));
}

export function filterOfficeAttendanceRows<T extends {date: any}>(rows: T[], dates: Set<string>, month: string): T[] {
  return rows.filter(row => {
    const key = supportDateKey(row.date, month);
    return key !== null && dates.has(key);
  });
}
