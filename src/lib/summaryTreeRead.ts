/** 一覧に反映する出席日・保存済み記録の日だけを通信の取得対象にする。 */
export function summaryTreeReadDates(
  month: string,
  attendance: Record<string, {isAbsent: boolean; isWaitlist: boolean}> | undefined,
  reports: Record<string, unknown> | undefined,
): string[] {
  const dates = new Set(Object.keys(reports || {}));
  for (const [date, day] of Object.entries(attendance || {})) {
    if (!day.isAbsent && !day.isWaitlist) dates.add(date);
  }
  return [...dates].flatMap(date => {
    const match = date.match(/^(\d+)月(\d+)日$/);
    return match && Number(match[1]) === Number(month.slice(5))
      ? [`${month}-${match[2].padStart(2, '0')}`] : [];
  }).sort();
}
