interface AttendanceDay {
  officeId: string;
  isAbsent?: boolean;
  isWaitlist?: boolean;
}

export function requiredSummaryDays(attendanceCount: number, isHoukago: boolean): number {
  if (attendanceCount <= 1) return attendanceCount;
  if (attendanceCount >= 12) return 6;
  return isHoukago && attendanceCount < 6 ? 2 : 4;
}

/** 療育記録の有無とは分け、選択事業所の出席予定だけを日数に含める。 */
export function countSummaryAttendance(
  days: number[], monthNumber: number, officeId: string,
  attendance: Record<string, AttendanceDay> | undefined,
  isIndividualDay: (day: number) => boolean,
) {
  let totalCount = 0;
  let individualCount = 0;
  for (const day of days) {
    const entry = attendance?.[`${monthNumber}月${day}日`];
    if (!entry || !officeId || entry.officeId !== officeId || entry.isAbsent || entry.isWaitlist) continue;
    totalCount++;
    if (isIndividualDay(day)) individualCount++;
  }
  return {totalCount, individualCount, nonIndividualCount: totalCount - individualCount};
}
