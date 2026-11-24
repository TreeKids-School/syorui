// YYYY-MM の月移動はタイムゾーン変換をせず、年月の数値で計算する。
export const shiftCalendarMonth = (value: string, offset: number): string => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match || !Number.isInteger(offset)) throw new Error('年月または移動月数が不正です。');
  const monthIndex = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  const year = Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};
