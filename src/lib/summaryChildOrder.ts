export type SummaryChildOrder = 'original' | 'staff' | 'name-asc' | 'name-desc' | 'today' | 'attendance-desc' | 'attendance-asc';

type SortableChild = { id?: string; fullName: string; nameKana?: string };
type OrderContext = {
  assignedStaff: Record<string, string>;
  staff: { id: string; name: string }[];
  attendanceCounts: Record<string, { attendanceCount: number }>;
  attendingToday: Set<string>;
};

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
const normalizeKana = (value: string) => value.normalize('NFKC').replace(/\s+/g, '')
  .replace(/[\u3041-\u3096]/g, char => String.fromCharCode(char.charCodeAt(0) + 0x60));

export const orderSummaryChildren = <T extends SortableChild>(children: T[], order: SummaryChildOrder, context: OrderContext): T[] => {
  if (order === 'original') return [...children];
  const staffNames = new Map(context.staff.map(member => [member.id, member.name]));
  const byName = (a: T, b: T, descending = false) => {
    const aKana = normalizeKana(a.nameKana || '');
    const bKana = normalizeKana(b.nameKana || '');
    // 読み仮名の未登録者は、昇順・降順とも最後に並べる。
    if (!!aKana !== !!bKana) return aKana ? -1 : 1;
    const compared = collator.compare(aKana || a.fullName, bKana || b.fullName);
    return (descending ? -compared : compared)
      || collator.compare(a.fullName, b.fullName) || collator.compare(a.id || '', b.id || '');
  };
  return [...children].sort((a, b) => {
    const aId = a.id || '';
    const bId = b.id || '';
    if (order === 'staff') {
      const aStaff = context.assignedStaff[aId];
      const bStaff = context.assignedStaff[bId];
      if (!!aStaff !== !!bStaff) return aStaff ? -1 : 1;
      const staffCompared = collator.compare(staffNames.get(aStaff) || aStaff || '', staffNames.get(bStaff) || bStaff || '')
        || collator.compare(aStaff || '', bStaff || '');
      if (staffCompared) return staffCompared;
    } else if (order === 'today') {
      const todayCompared = Number(context.attendingToday.has(bId)) - Number(context.attendingToday.has(aId));
      if (todayCompared) return todayCompared;
    } else if (order === 'attendance-asc' || order === 'attendance-desc') {
      const countCompared = (context.attendanceCounts[aId]?.attendanceCount ?? 0) - (context.attendanceCounts[bId]?.attendanceCount ?? 0);
      if (countCompared) return order === 'attendance-desc' ? -countCompared : countCompared;
    }
    return byName(a, b, order === 'name-desc');
  });
};

export const japanDateKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);
