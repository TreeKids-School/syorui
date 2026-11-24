import type {DailyReport, SupportPlanMeta} from '../types/supportPlan';

export type SupportChange = {date: string; field: string; action: '追加' | '変更' | '削除'};
export type SupportSnapshot = {meta: SupportPlanMeta | null; rows: DailyReport[]};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 本文は履歴に複製せず、変更された日付・項目だけを記録する。 */
export function describeSupportChanges(before: SupportSnapshot, after: SupportSnapshot): SupportChange[] {
  const changes: SupportChange[] = [];
  for (const [key, label] of [['goals','支援目標'],['selectedProfPlanId','反映元の計画'],['author','作成者'],['excludedDates','表示対象の日付']] as const) {
    if (!same(before.meta?.[key], after.meta?.[key])) changes.push({date: '', field: label, action: '変更'});
  }
  const rowKey = (row: DailyReport) => row.localKey || row.id || String(row.date);
  const previous = new Map(before.rows.map(row => [rowKey(row), row]));
  for (const row of after.rows) {
    const old = previous.get(rowKey(row));
    const date = String(row.date);
    if (!old) {changes.push({date, field: '療育記録', action: '追加'}); continue;}
    if (!same(old.date, row.date)) changes.push({date, field: '日付', action: '変更'});
    if (old.archived !== row.archived) changes.push({date, field: 'アーカイブ状態', action: '変更'});
    for (const [key, label] of [['externalInfo','ツリー通信'],['supportContent','療育内容'],['resultInfo','療育を行った結果'],['futurePlan','今後の予定'],['isVerified','確認済み']] as const) {
      if (!same(old.content?.[key], row.content?.[key])) changes.push({date, field: label, action: '変更'});
    }
  }
  return changes;
}
