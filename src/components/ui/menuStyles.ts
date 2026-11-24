/** DESIGN_RULES.md の操作メニュー共通スタイル。 */
export const menuSurfaceClass='rounded-2xl border border-slate-200 bg-white p-2 text-left text-sm font-normal tracking-normal text-slate-700 shadow-xl';
export const menuItemClass='flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm font-normal leading-5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';
export const menuTriggerClass='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary';

export const menuActionClass=menuItemClass.replace('justify-between','justify-start');
