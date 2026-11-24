// 日曜始まり。月の1日を含む週を第1週とする。
export const calendarWeekOfMonth = (year: number, month: number, day: number) =>
  Math.floor((new Date(year, month - 1, 1).getDay() + day - 1) / 7) + 1;

export const isAutoSelectCandidate = (year: number, month: number, day: number, excludedWeeks: number[], attending: boolean) =>
  attending && !excludedWeeks.includes(calendarWeekOfMonth(year, month, day));
