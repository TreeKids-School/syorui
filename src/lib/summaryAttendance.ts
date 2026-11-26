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

/** 個別療育分を基準数へ上乗せするか、基準数の内数にするかを選ぶ。 */
export function summaryAdoptionTargets(baseRequiredDays:number,individualCount:number,attendanceCount:number,addIndividualDays:boolean){
  const individual=Math.max(0,Math.min(attendanceCount,individualCount));
  const requiredDays=attendanceCount<=1?Math.max(0,attendanceCount):Math.min(6,addIndividualDays?baseRequiredDays+individual:Math.max(baseRequiredDays,individual));
  return {requiredDays,nonIndividualCount:Math.max(0,requiredDays-individual)};
}
