import {ViewportModal} from './ViewportModal';
import {useState} from 'react';
import {Download, X} from 'lucide-react';

export function SupportExcelExportSettings({month, onDirect, onDownload, onClose}: {
  month: string; onDirect: () => void; onDownload: () => void; onClose: () => void;
}) {
  const directAvailable = 'showOpenFilePicker' in window;
  const [destination, setDestination] = useState<'direct' | 'download'>(directAvailable ? 'direct' : 'download');
  return <ViewportModal className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/50 p-4 print:hidden" onKeyDown={event => {if (event.key === 'Escape') onClose();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="support-excel-title" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 id="support-excel-title" className="font-bold text-slate-800">Excelへ出力</h2>
        <button autoFocus type="button" aria-label="Excel出力設定を閉じる" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600">原本を複製して、{month.replace('-', '年')}月のシートを追加します。</p>
        <fieldset className="overflow-hidden rounded-xl border border-slate-200">
          <legend className="sr-only">保存先</legend>
          <label className={`flex items-center justify-between gap-3 p-4 text-sm ${!directAvailable ? 'text-slate-400' : 'text-slate-700'}`}>
            選択したExcelファイルに保存<input type="radio" name="support-excel-destination" value="direct" checked={destination === 'direct'} disabled={!directAvailable} onChange={() => setDestination('direct')} className="accent-emerald-600" />
          </label>
          <label className="flex items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm text-slate-700">
            別ファイルでダウンロード<input type="radio" name="support-excel-destination" value="download" checked={destination === 'download'} onChange={() => setDestination('download')} className="accent-emerald-600" />
          </label>
        </fieldset>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600">キャンセル</button>
        <button type="button" onClick={() => {onClose(); if (destination === 'direct') onDirect(); else onDownload();}} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><Download size={16} />ファイルを選んで出力</button>
      </div>
    </section>
  </ViewportModal>;
}
