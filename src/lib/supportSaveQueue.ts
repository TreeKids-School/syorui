import type {DailyReport, SupportPlanMeta} from '../types/supportPlan';

/** 保存を直列化し、保存中の複数要求は最後の要求へまとめる。 */
export function createLatestSaveQueue() {
  let pending: (() => Promise<void>) | null = null;
  let running: Promise<void> | null = null;
  return {
    run(task: () => Promise<void>): Promise<void> {
      pending = task;
      if (!running) running = Promise.resolve().then(async () => {
        try {
          while (pending) {
            const next = pending;
            pending = null;
            await next();
          }
        } finally {running = null;}
      });
      return running;
    },
  };
}

export function supportDraftSignature(meta: SupportPlanMeta | null, rows: DailyReport[]) {
  return JSON.stringify({meta: meta ? {childId: meta.childId, month: meta.month, goals: meta.goals,
    author: meta.author, createdAt: meta.createdAt, selectedProfPlanId: meta.selectedProfPlanId, excludedDates: meta.excludedDates} : null,
    rows: rows.map(row => ({childId: row.childId, planMonth: row.planMonth, date: row.date, staffId: row.staffId,
      type: row.type, archived: row.archived, content: {externalInfo: row.content?.externalInfo,
        supportContent: row.content?.supportContent, resultInfo: row.content?.resultInfo,
        futurePlan: row.content?.futurePlan, isVerified: row.content?.isVerified}}))});
}

/** 保存結果から受け取るのはIDだけ。保存中の編集・削除・並び替えはそのまま保つ。 */
export function mergeSavedSupportIds<T extends {id?: string; localKey?: string}>(rows: T[], ids: Map<string, string>): T[] {
  let changed = false;
  const next = rows.map(row => {
    const id = row.localKey && ids.get(row.localKey);
    if (row.id || !id) return row;
    changed = true;
    return {...row, id};
  });
  return changed ? next : rows;
}

/** 明示的に削除が確定され、保存対象から消えた行だけを削除する。 */
export function supportRowDeletions(scope:string, rows:DailyReport[], requests:Map<string,DailyReport> | undefined, assignedIds:Map<string,string>) {
  return [...(requests?.entries() || [])].filter(([key])=>!rows.some(row=>row.localKey===key))
    .map(([key,row])=>({key,row,id:row.id || assignedIds.get(scope+':'+key)}));
}
