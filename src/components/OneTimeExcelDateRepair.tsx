import {useState} from 'react';
import {Loader2, Wrench} from 'lucide-react';
import {repairExcelDateFormats} from '../lib/preserveExcelSheets';
import {SettingsGroup} from './SettingsGroup';

interface RepairFile {
  handle: any;
  name: string;
  size: number;
  lastModified: number;
  cells: number;
  sheets: string[];
  status: 'pending' | 'done' | 'error';
  message?: string;
}

export function OneTimeExcelDateRepair({officeId}: {officeId: string}) {
  const completionKey = `excel-date-format-repair-v3:${officeId}`;
  const [completed, setCompleted] = useState(() => {
    try { return localStorage.getItem(completionKey) === 'done'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const [directory, setDirectory] = useState<any>(null);
  const [files, setFiles] = useState<RepairFile[]>([]);
  const [message, setMessage] = useState('');
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  if (completed) return null;

  const scan = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setFiles([]);
    setDirectory(null);
    setScanErrors([]);
    try {
      if (!('showDirectoryPicker' in window)) throw new Error('ChromeまたはEdgeで開いてください。');
      const folder = await (window as any).showDirectoryPicker({mode: 'read'});
      const found: RepairFile[] = [];
      const errors: string[] = [];
      for await (const entry of folder.values()) {
        if (entry.kind !== 'file' || !/\.xlsx$/i.test(entry.name) || entry.name.startsWith('~$')) continue;
        try {
          const file = await entry.getFile();
          const result = await repairExcelDateFormats(await file.arrayBuffer(), true);
          if (result.changedCells) found.push({handle: entry, name: file.name, size: file.size, lastModified: file.lastModified,
            cells: result.changedCells, sheets: result.sheetNames, status: 'pending'});
        } catch (error: any) { errors.push(`${entry.name}: ${error.message || error}`); }
      }
      setFiles(found);
      setScanErrors(errors);
      setDirectory(folder);
      setMessage(found.length ? `「${folder.name}」の修復対象を確認してください。` : '修復が必要な日付欄は見つかりませんでした。');
    } catch (error: any) {
      setMessage(error.name === 'AbortError' ? 'フォルダの読み取り許可を確認できませんでした。' : String(error.message || error));
    } finally { setBusy(false); }
  };

  const repair = async () => {
    if (busy || !directory) return;
    setBusy(true);
    setMessage('');
    try {
      if (await directory.requestPermission({mode: 'readwrite'}) !== 'granted') {
        throw new Error('書き込みが許可されませんでした。ファイルは変更していません。');
      }
      const backup = await directory.getDirectoryHandle('日付表示修復前バックアップ', {create: true});
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const updated = [...files];
      for (let i = 0; i < updated.length; i++) {
        const item = updated[i];
        if (item.status === 'done') continue;
        try {
          const file = await item.handle.getFile();
          if (file.size !== item.size || file.lastModified !== item.lastModified) {
            throw new Error('確認後にファイルが変更されています。フォルダを選び直してください。');
          }
          const original = await file.arrayBuffer();
          const result = await repairExcelDateFormats(original);
          if (!result.buffer) { item.status = 'done'; continue; }
          const backupHandle = await backup.getFileHandle(`${stamp}_${item.name}`, {create: true});
          const backupWriter = await backupHandle.createWritable();
          await backupWriter.write(original);
          await backupWriter.close();
          const writer = await item.handle.createWritable();
          try { await writer.write(result.buffer); await writer.close(); }
          catch (error) { try { await writer.abort(); } catch { /* close済みの場合 */ } throw error; }
          item.status = 'done';
          item.message = undefined;
        } catch (error: any) {
          item.status = 'error';
          item.message = String(error.message || error);
        }
        setFiles(updated.map(item => ({...item})));
      }
      if (updated.every(item => item.status === 'done') && !scanErrors.length) {
        try { localStorage.setItem(completionKey, 'done'); } catch { /* 現在の画面では非表示にする */ }
        setCompleted(true);
      } else {
        setMessage('完了したファイルは修復済みです。エラーのあるファイルを確認してください。');
      }
    } catch (error: any) { setMessage(String(error.message || error)); }
    finally { setBusy(false); }
  };

  return <SettingsGroup title="今回限りの修復">
    <div className="space-y-3 px-4 py-4">
      <button type="button" disabled={busy} onClick={() => void scan()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <Wrench size={17} />}
        過去シートの日付表示を一度だけ修復
      </button>
      <p className="text-xs leading-relaxed text-slate-500">月別シートの日付欄だけを「○月○日」に戻します。修復前のファイルは、同じフォルダ内の「日付表示修復前バックアップ」に保存します。完了後、このボタンは表示されなくなります。</p>
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      {files.length > 0 && <>
        <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">ファイル</th><th className="p-2">対象シート</th><th className="p-2">日付欄</th></tr></thead>
            <tbody>{files.map(item => <tr key={item.name} className="border-t border-slate-100"><td className="p-2">{item.name}{item.status === 'done' && '（完了）'}{item.message && <p className="text-rose-600">{item.message}</p>}</td><td className="p-2">{item.sheets.join('、')}</td><td className="p-2">{item.cells}か所</td></tr>)}</tbody>
          </table>
        </div>
        <button type="button" disabled={busy || files.every(item => item.status === 'done')} onClick={() => void repair()} className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? '処理中…' : 'バックアップを作成して日付表示を修復'}</button>
      </>}
      {scanErrors.map(error => <p key={error} role="alert" className="text-xs text-rose-600">{error}</p>)}
    </div>
  </SettingsGroup>;
}
