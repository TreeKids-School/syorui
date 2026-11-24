import { matchesOffice, OFFICE_IDS } from './officeUtils';

function matchesOnlyOffice(officeId: string, value: unknown): boolean {
  const values = Array.isArray(value) ? value : typeof value === 'object' && value ? Object.values(value) : [value];
  return values.length > 0 && values.every(item => matchesOffice(officeId, item)
    && Object.values(OFFICE_IDS).every(other => matchesOffice(officeId, other) || !matchesOffice(other, item)));
}

/** 事業所を特定できる記録だけを出力する。大きい値ほど目標データの優先順位が高い。 */
export function excelExportOfficePriority(
  data: { officeId?: unknown; office?: unknown; childId?: unknown; month?: unknown; planMonth?: unknown }, documentId: string,
  child: { id?: string; offices?: string[] }, officeId: string, month: string,
): number {
  if (!officeId || !child.id) return 0;
  if (data.childId && data.childId !== child.id) return 0;
  if ((data.month && data.month !== month) || (data.planMonth && data.planMonth !== month)) return 0;
  const suffix = `_${child.id}_${month}`;
  const datePrefix = documentId.match(/^(.+)_(\d{4}-\d{2}-\d{2})$/)?.[1] || '';
  const prefixedOffice = documentId.endsWith(suffix) ? documentId.slice(0, -suffix.length) : datePrefix;
  const declared = [data.officeId, data.office, prefixedOffice].filter(value => value !== undefined && value !== null && value !== '');
  // 本文とドキュメントIDが矛盾する場合も採用しない。
  if (declared.length) {
    if (!declared.every(value => matchesOnlyOffice(officeId, value))) return 0;
    return prefixedOffice ? 3 : 2;
  }
  // 旧形式の事業所未記録データは、所属が一意に決まる児童に限る。
  const offices = Array.isArray(child.offices) ? child.offices : child.offices ? [child.offices] : [];
  return offices.length > 0 && offices.every(value => matchesOnlyOffice(officeId, value)) ? 1 : 0;
}
