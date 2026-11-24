import type { ReactNode } from 'react';

/** 関連する設定を、見出しと区切り線のあるリストにまとめる。 */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-2 border-0 p-0">
      <legend className="mb-2 px-3 text-xs font-semibold text-slate-500">{title}</legend>
      <div className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-slate-200/60 [&>*+*]:border-t [&>*+*]:border-slate-100">{children}</div>
    </fieldset>
  );
}

export const settingsRowClass = 'flex min-h-12 cursor-pointer items-center justify-between gap-4 px-4 py-3 text-sm text-slate-700 has-[:focus-visible]:bg-slate-50';

export function SettingsFeature({ title, description, direction, details }: { title: string; description: string; direction: string; details: string[] }) {
  return <SettingsGroup title="機能の説明">
    <div className="space-y-2 px-4 py-4">
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <p className="text-sm leading-relaxed text-slate-500">{description}</p>
    </div>
    <div className={settingsRowClass}><span className="shrink-0">データの向き</span><span className="text-right text-slate-500">{direction}</span></div>
    <ul className="space-y-2 px-4 py-3 text-xs leading-relaxed text-slate-500">{details.map(detail => <li key={detail}>・{detail}</li>)}</ul>
  </SettingsGroup>;
}
