export const OFFICE_IDS = {
  SEARCH: 'LNrWc8f6G703aUYRZ5e2',
  HOME: 'nWioUcWXUskreYjmSL8p',
} as const;

export const normalizeOfficeString = (val?: any): string => {
  if (!val) return '';
  return String(val).toLowerCase().replace(/[\s\-_+]/g, '');
};

/**
 * 文字列やタグが「ホーム」系か判定
 * ホーム, HOME, treekidsschoolhome, TREE KIDS SCHOOL HOME, nWioUcWXUskreYjmSL8p など
 */
export const isHomeOffice = (val?: any): boolean => {
  if (!val) return false;
  const s = normalizeOfficeString(val);
  return (
    s.includes('ホーム') ||
    s.includes('home') ||
    s.includes('treekidsschoolhome') ||
    s === OFFICE_IDS.HOME.toLowerCase()
  );
};

/**
 * 文字列やタグが「サーチ」系か判定
 * サーチ, SEARCH, treekidsschoolsearch, Tree Kids School Search, LNrWc8f6G703aUYRZ5e2 など
 */
export const isSearchOffice = (val?: any): boolean => {
  if (!val) return false;
  const s = normalizeOfficeString(val);
  return (
    s.includes('サーチ') ||
    s.includes('search') ||
    s.includes('treekidsschoolsearch') ||
    s === OFFICE_IDS.SEARCH.toLowerCase()
  );
};

/**
 * 指定の officeId と タグ・所属配列が一致するか判定
 */
export const matchesOffice = (officeId: string, tagsOrOffices: any): boolean => {
  if (!tagsOrOffices) return false;
  const list: any[] = Array.isArray(tagsOrOffices)
    ? tagsOrOffices
    : typeof tagsOrOffices === 'string'
      ? [tagsOrOffices]
      : typeof tagsOrOffices === 'object'
        ? Object.values(tagsOrOffices)
        : [tagsOrOffices];

  const targetIsSearch = isSearchOffice(officeId);
  const targetIsHome = isHomeOffice(officeId);

  return list.some(item => {
    if (targetIsSearch && isSearchOffice(item)) return true;
    if (targetIsHome && isHomeOffice(item)) return true;
    return normalizeOfficeString(item) === normalizeOfficeString(officeId);
  });
};

/** 所属の別名・IDの重複を一本化する。事業所でない一般タグは所属に混ぜない。 */
export function resolveChildOffices(data: Record<string, any>): string[] {
  const list = (value: any): any[] => Array.isArray(value) ? value : value ? [value] : [];
  const membership = [...list(data.offices), ...list(data.office), ...list(data.officeId)];
  const tags = [...list(data.tags), ...list(data.officeTags)].filter(value => isSearchOffice(value) || isHomeOffice(value));
  const resolved = new Set<string>();
  for (const value of [...membership, ...tags]) {
    const search = isSearchOffice(value), home = isHomeOffice(value);
    if (search) resolved.add(OFFICE_IDS.SEARCH);
    if (home) resolved.add(OFFICE_IDS.HOME);
    if (!search && !home && typeof value === 'string' && value.trim()) resolved.add(value.trim());
  }
  // 事業所未設定の児童をサーチへ表示する、既存の初期所属ルールと合わせる。
  return resolved.size ? [...resolved] : [OFFICE_IDS.SEARCH];
}

/** 閲覧対象を登録済み事業所に限定し、担当の有無とは分けて所属を判定する。 */
export function childrenForOffice<T extends {offices?:any;archived?:boolean}>(children:T[],officeId:string,offices:{id:string;name:string}[]):T[]{
  const office=offices.find(value=>value.id===officeId);if(!office)return [];
  return children.filter(child=>!child.archived&&(matchesOffice(officeId,resolveChildOffices(child))||matchesOffice(office.name,resolveChildOffices(child))));
}
