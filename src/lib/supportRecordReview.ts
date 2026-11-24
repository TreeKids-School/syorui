import type {DailyReport} from '../types/supportPlan';

export const hasRecordText = (text?: string) => !!text?.replace(/[\s\-‐‑‒–—―ー−]/g, '');

export function isEmptyNewSupportRecord(row: DailyReport): boolean {
  return !row.id && !hasRecordText(row.content.externalInfo)
    && !row.content.supportContent?.some(hasRecordText)
    && !hasRecordText(row.content.resultInfo) && !hasRecordText(row.content.futurePlan)
    && !row.content.isVerified;
}

export function needsNewsletterReview(row: DailyReport, newsletters: Record<string, string>): boolean {
  return !row.archived && !!row.id
    && !hasRecordText(newsletters[row.date]) && !hasRecordText(row.content.externalInfo)
    && (!!row.content.supportContent?.some(hasRecordText)
      || hasRecordText(row.content.resultInfo) || hasRecordText(row.content.futurePlan));
}
