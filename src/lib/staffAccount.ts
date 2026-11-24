export type StaffAccount = {name: string; color: string};
export function resolveStaffAccount(data: Record<string, any>, fallbackName = ''): StaffAccount {
  const name = [data.name, data.fullName, fallbackName].find(value => typeof value === 'string' && value.trim())?.trim() || '';
  const raw = [data.color, data.staffColor, data.themeColor, data.userColor, data.iconColor, data.avatarColor]
    .find(value => typeof value === 'string' && value.trim())?.trim() || '';
  const colors: Record<string, string> = {blue:'#2563eb',red:'#dc2626',green:'#16a34a',emerald:'#059669',amber:'#d97706',yellow:'#ca8a04',purple:'#7c3aed',pink:'#db2777',cyan:'#0891b2',orange:'#ea580c',teal:'#0d9488',indigo:'#4f46e5',lime:'#65a30d',rose:'#e11d48'};
  const color = /^(#|rgb|hsl)/i.test(raw) ? raw : Object.entries(colors).find(([key]) => raw.toLowerCase().includes(key))?.[1] || raw || '#64748b';
  return {name, color};
}
