/** 児童マスターの既存・旧形式のアーカイブ状態を正規化する。 */
export function isArchivedChild(data: {archived?: unknown; isArchived?: unknown; status?: unknown}): boolean {
  return data.archived === true || data.isArchived === true ||
    (typeof data.status === 'string' && data.status.trim().toLowerCase() === 'archived');
}
