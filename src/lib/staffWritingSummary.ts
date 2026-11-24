/** 担当児童の必要日数をすべて記入した場合の合計。個別療育分を除く。 */
export function summarizeStaffWritingDays(
  childRequiredCounts: Record<string, {nonIndividualCount: number}>,
  assignments: Record<string, string>,
): Record<string, {childCount: number; days: number}> {
  const result: Record<string, {childCount: number; days: number}> = {};
  for (const [childId, counts] of Object.entries(childRequiredCounts)) {
    if (counts.nonIndividualCount <= 0) continue;
    const staffId = assignments[childId] || '';
    const bucket = result[staffId] ||= {childCount: 0, days: 0};
    bucket.childCount++;
    bucket.days += counts.nonIndividualCount;
  }
  return result;
}
