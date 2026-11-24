import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { preserveExistingExcelSheets, verifyAddedExcelSheet } from './preserveExcelSheets';

/**
 * Excelファイルをダウンロードするユーティリティ
 */
export const downloadExcel = (data: any[], fileName: string, sheetName: string = 'Sheet1') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

/**
 * 西暦の年月（例: "2026-08"）を和暦の年月（例: "令和8年 8月"）に変換する
 */
const parseToWarekiMonth = (monthStr: string): string => {
  if (!monthStr) return '令和   年   月';
  const [yearStr, valMonthStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(valMonthStr, 10);
  if (isNaN(year) || isNaN(month)) return '令和   年   月';

  if (year >= 2019) {
    const rYear = year - 2018;
    const rYearStr = rYear === 1 ? '元' : String(rYear);
    return `令和${rYearStr}年 ${month}月`;
  }
  return `${year}年 ${month}月`;
};

/**
 * 日付文字列（例: "2026-08-01"）を和暦の年月日（例: "令和8年8月1日"）に変換する
 */
const parseToWarekiDate = (dateStr?: string): string => {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) {
    // パースに失敗した場合は再度本日日付で呼び出し
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const date = today.getDate();
    const rYear = year - 2018;
    return `令和${rYear === 1 ? '元' : rYear}年${month}月${date}日`;
  }
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();

  if (year >= 2019) {
    const rYear = year - 2018;
    const rYearStr = rYear === 1 ? '元' : String(rYear);
    return `令和${rYearStr}年${month}月${date}日`;
  }
  return `${year}年${month}月${date}日`;
};

/**
 * 日付文字列やTimestampを比較・ソート用数値キー（YYYYMMDD相当）に変換するヘルパー（日付の若い順で並べるため）
 */
export const parseDateToSortKey = (dateVal: any, defaultYear?: number): number => {
  if (!dateVal) return 99999999;

  // 1) Firestore Timestamp (toDate メソッドを持つオブジェクト)
  if (typeof dateVal === 'object' && typeof dateVal.toDate === 'function') {
    const d = dateVal.toDate();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  // 2) Date オブジェクト
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return dateVal.getFullYear() * 10000 + (dateVal.getMonth() + 1) * 100 + dateVal.getDate();
  }

  const str = String(dateVal).trim();
  if (!str) return 99999999;

  // 3) "YYYY-MM-DD", "YYYY/MM/DD", "YYYY年M月D日", "YYYY.MM.DD"
  const ymdMatch = str.match(/(?:(\d{4})|(\d{2}))[年/\-.]\s*(\d{1,2})[月/\-.]\s*(\d{1,2})日?/);
  if (ymdMatch) {
    const yRaw = parseInt(ymdMatch[1] || ymdMatch[2], 10);
    const m = parseInt(ymdMatch[3], 10);
    const d = parseInt(ymdMatch[4], 10);
    const fullYear = yRaw < 100 ? (yRaw >= 70 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
    return fullYear * 10000 + m * 100 + d;
  }

  // 4) "M月D日", "MM-DD", "MM/DD"
  const mdMatch = str.match(/(\d{1,2})[月/\-.]\s*(\d{1,2})日?/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1], 10);
    const d = parseInt(mdMatch[2], 10);
    const yr = defaultYear || 2000;
    return yr * 10000 + m * 100 + d;
  }

  // 5) 整数日のみ (例: "1日", "15")
  const dayOnlyMatch = str.match(/^(\d{1,2})日?$/);
  if (dayOnlyMatch) {
    const d = parseInt(dayOnlyMatch[1], 10);
    const yr = defaultYear || 2000;
    return yr * 10000 + 100 + d;
  }

  // 6) Date.parse
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
  }

  return 99999999;
};

/**
 * 支援実施記録（rows）を日付の若い順（昇順）にソートするヘルパー
 */
export const sortRowsByDateAsc = (rows: any[], month?: string): any[] => {
  const defaultYear = month ? parseInt(month.split('-')[0], 10) : undefined;
  let activeRows = [...rows].filter(r => !r.archived);

  // 対象年月が指定されている場合、その月以外のデータ（前月分など）は除外する
  if (month) {
    const [targetYStr, targetMStr] = month.split('-');
    const targetY = parseInt(targetYStr, 10);
    const targetM = parseInt(targetMStr, 10);

    if (!isNaN(targetY) && !isNaN(targetM)) {
      activeRows = activeRows.filter(r => {
        const k = parseDateToSortKey(r.date, defaultYear);
        if (k === 99999999) return true; // 日付空欄などは念のため残す
        const ry = Math.floor(k / 10000);
        const rm = Math.floor((k % 10000) / 100);
        return ry === targetY && rm === targetM;
      });
    }
  }

  return activeRows.sort((a, b) => parseDateToSortKey(a.date, defaultYear) - parseDateToSortKey(b.date, defaultYear));
};

/** 原本の6枠を超えた記録を、正常終了扱いで切り捨てない。 */
export const existingExcelRows = (rows: any[], month: string): any[] => {
  const active = sortRowsByDateAsc(rows, month);
  if (active.length > 6) throw new Error(`出力対象が${active.length}件あり、原本の6枠に収まりません。採用日を6日以内に調整してください。ファイルは変更していません。`);
  return active;
};

/**
 * セル内の文字量に応じてフォントサイズを決定するヘルパー
 * （セルの枠を超えそうな場合は 9、それ以外は 10）
 */
const determineFontSize = (text: string | null | undefined): number => {
  if (!text) return 10;
  const str = String(text);
  const lines = str.split('\n');
  const maxLineLength = Math.max(...lines.map(l => l.length));
  
  // 1行が14文字を超える、または全体の文字数が30文字を超える、または行数が3行を超える場合は 9.5 に縮小
  if (maxLineLength >= 14 || str.length >= 30 || lines.length >= 3) {
    return 9.5;
  }
  return 10;
};

/**
 * 療育内容の配列から空文字を除去し、番号の若い順（例: ①, ②, ③）にソートするヘルパー
 */
export const sortSupportContents = (contents: any[]): string[] => {
  if (!contents || !Array.isArray(contents)) return [];
  return contents
    .filter(c => c && typeof c === 'string' && c.trim() !== '')
    .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
};

/**
 * 専門的支援実施計画のエクスポート用データ作成 (新規生成・画像レイアウト再現)
 */
export const exportSupportImplementation = (
  childName: string,
  month: string,
  goals: string,
  rows: any[],
  fileName: string,
  authorName?: string,
  createdAt?: string
) => {
  const activeRows = sortRowsByDateAsc(rows, month);
  const totalRows = activeRows.length;
  // 1ページ最大6件。データがない場合でも最低 1ページ生成
  const totalPages = Math.max(1, Math.ceil(totalRows / 6));

  const worksheet: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const rowsHeight: { hpt: number }[] = [];

  const writeCell = (r: number, c: number, val: any) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    worksheet[addr] = { t: typeof val === 'number' ? 'n' : 's', v: val };
  };

  const warekiMonth = parseToWarekiMonth(month);

  for (let p = 0; p < totalPages; p++) {
    const B = p * 42; // ベース行

    // 1. タイトル行
    writeCell(B, 0, '専門的支援実施計画');
    merges.push({ s: { r: B, c: 0 }, e: { r: B, c: 8 } });
    rowsHeight.push({ hpt: 35 });

    // 2. Tree Kids & 名前
    writeCell(B + 1, 0, 'Tree Kids School Search');
    merges.push({ s: { r: B + 1, c: 0 }, e: { r: B + 2, c: 5 } });

    writeCell(B + 1, 6, '名前');
    merges.push({ s: { r: B + 1, c: 6 }, e: { r: B + 2, c: 7 } });

    writeCell(B + 1, 8, childName);
    merges.push({ s: { r: B + 1, c: 8 }, e: { r: B + 2, c: 8 } });

    rowsHeight.push({ hpt: 20 }, { hpt: 20 });

    // 3. 支援目標ヘッダー
    writeCell(B + 3, 0, '支援目標');
    merges.push({ s: { r: B + 3, c: 0 }, e: { r: B + 3, c: 8 } });
    rowsHeight.push({ hpt: 20 });

    // 4. 支援目標内容
    writeCell(B + 4, 0, goals);
    merges.push({ s: { r: B + 4, c: 0 }, e: { r: B + 8, c: 8 } });
    rowsHeight.push({ hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 });

    // 5. 対象年月
    writeCell(B + 9, 0, warekiMonth);
    merges.push({ s: { r: B + 9, c: 0 }, e: { r: B + 9, c: 8 } });
    rowsHeight.push({ hpt: 20 });

    // 6. テーブルヘッダー
    writeCell(B + 10, 0, '日付');
    writeCell(B + 10, 1, '療育内容');
    merges.push({ s: { r: B + 10, c: 1 }, e: { r: B + 10, c: 3 } });
    writeCell(B + 10, 4, '療育を行った結果');
    merges.push({ s: { r: B + 10, c: 4 }, e: { r: B + 10, c: 6 } });
    writeCell(B + 10, 7, '今後の予定');
    merges.push({ s: { r: B + 10, c: 7 }, e: { r: B + 10, c: 8 } });
    rowsHeight.push({ hpt: 22 });

    // 7. データブロック (6件)
    for (let k = 0; k < 6; k++) {
      const S = B + 11 + k * 5;
      const dataIdx = p * 6 + k;
      const rowData = activeRows[dataIdx];

      merges.push({ s: { r: S, c: 0 }, e: { r: S + 4, c: 0 } }); // 日付結合
      for (let i = 0; i < 5; i++) {
        merges.push({ s: { r: S + i, c: 1 }, e: { r: S + i, c: 3 } }); // 各行の療育内容はB〜D列結合
      }
      merges.push({ s: { r: S, c: 4 }, e: { r: S + 4, c: 6 } }); // 結果結合(E〜G列)
      merges.push({ s: { r: S, c: 7 }, e: { r: S + 4, c: 8 } }); // 予定結合(H〜I列)

      rowsHeight.push({ hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 });

      if (rowData) {
        writeCell(S, 0, rowData.date || '');
        
        const contents = sortSupportContents(rowData.content.supportContent);
        for (let i = 0; i < 5; i++) {
          writeCell(S + i, 1, contents[i] || '');
        }

        writeCell(S, 4, rowData.content.resultInfo || '');
        writeCell(S, 7, rowData.content.futurePlan || '');
      } else {
        writeCell(S, 0, '');
        for (let i = 0; i < 5; i++) {
          writeCell(S + i, 1, '');
        }
        writeCell(S, 4, '');
        writeCell(S, 7, '');
      }
    }

    // 8. フッター
    const warekiDate = parseToWarekiDate(createdAt);
    writeCell(B + 41, 0, `${warekiDate}作成   作成者：${authorName || ''}`);
    merges.push({ s: { r: B + 41, c: 0 }, e: { r: B + 41, c: 5 } });

    writeCell(B + 41, 6, '(保護者署名)');
    merges.push({ s: { r: B + 41, c: 6 }, e: { r: B + 41, c: 8 } });

    rowsHeight.push({ hpt: 25 });
  }

  // シートサイズの設定
  const maxRow = totalPages * 42;
  worksheet['!ref'] = `A1:I${maxRow}`;
  worksheet['!merges'] = merges;
  worksheet['!rows'] = rowsHeight;

  // 列幅の設定
  worksheet['!cols'] = [
    { wch: 10 }, // A: 日付
    { wch: 25 }, // B: 療育内容
    { wch: 12 }, // C: 結果1
    { wch: 12 }, // D: 結果2
    { wch: 12 }, // E: 結果3
    { wch: 12 }, // F: 結果4
    { wch: 12 }, // G: 予定1
    { wch: 12 }, // H: 予定2
    { wch: 12 }  // I: 予定3
  ];

  // 改ページの設定
  if (totalPages > 1) {
    const breaks = Array.from({ length: totalPages - 1 }, (_, i) => (i + 1) * 42 - 1);
    worksheet['!rowbreaks'] = breaks.map(rowIdx => ({ qty: 1, tb: rowIdx }));
  }

  // グリッド線を表示する設定
  worksheet['!views'] = [{ showGridLines: true }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '実施計画');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

/**
 * 原本から対象月シートを追加し、既存シートを保護したExcelをダウンロードする。
 */
export const exportToExistingExcel = async (
  file: File,
  childName: string,
  month: string,
  goals: string,
  rows: any[],
  fileName: string,
  authorName?: string,
  createdAt?: string,
  onLog?: (msg: string) => void
): Promise<{sheetName: string}> => {
  let output: any;
  // ダウンロード版も一括出力と同じ原本複製・入力規則・既存シート保護を使う。
  const result = await cloneTemplateAndWriteExcelFile({
    getFile: async () => file,
    createWritable: async () => ({
      write: async (buffer: any) => {output = buffer;},
      close: async () => {},
    }),
  }, childName, month, goals, rows, authorName, `${parseToWarekiDate(createdAt)}作成`, onLog);
  if (!output) throw new Error('Excelファイルを生成できませんでした。');
  const blob = new Blob([output], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = window.URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.xlsx`;
    anchor.click();
    onLog?.('原本を複製したExcelのダウンロードを開始しました。');
  } finally {window.URL.revokeObjectURL(url);}
  return result;
};

/** 個人の直接保存も、一括出力と同じ保護付き原本複製を行う。 */
export const overwriteExistingExcelFile = async (
  fileHandle: any,
  childName: string,
  month: string,
  goals: string,
  rows: any[],
  authorName?: string,
  createdAt?: string,
  onLog?: (msg: string) => void
): Promise<{sheetName: string}> => {
  return cloneTemplateAndWriteExcelFile(fileHandle, childName, month, goals, rows,
    authorName, `${parseToWarekiDate(createdAt)}作成`, onLog, true);
};

/**
 * 日付文字列（例: "2026-08-12"）から年を除き「8月12日」形式に変換するヘルパー
 */
const formatDisplayDateNoYear = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  // 1) "YYYY-MM-DD", "YYYY/MM/DD", "YYYY年M月D日", "YYYY.MM.DD" など
  const ymdMatch = str.match(/(?:\d{4}|\d{2})[年/\-.]\s*(\d{1,2})[月/\-.]\s*(\d{1,2})日?/);
  if (ymdMatch) {
    const m = parseInt(ymdMatch[1], 10);
    const d = parseInt(ymdMatch[2], 10);
    return `${m}月${d}日`;
  }
  // 2) "MM-DD", "MM/DD", "M月D日" など
  const mdMatch = str.match(/^(\d{1,2})[月/\-.]\s*(\d{1,2})日?$/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1], 10);
    const d = parseInt(mdMatch[2], 10);
    return `${m}月${d}日`;
  }
  // 3) Dateパース
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    return `${dt.getMonth() + 1}月${dt.getDate()}日`;
  }
  return str;
};

/**
 * エクセル内の「原本」シートを末尾にコピーし、年月（例: 202609）のシート名で作成して上書き保存する
 * 既に同名シートが存在する場合は （B）, （C）... と自動付番する
 */
export const cloneTemplateAndWriteExcelFile = async (
  fileHandle: any,
  childName: string,
  month: string, // 例: "2026-09"
  _goals: string,
  rows: any[],
  authorName?: string,
  createdDateText?: string,
  onLog?: (msg: string) => void,
  verifySavedFile = false
): Promise<{ sheetName: string }> => {
  const log = (msg: string) => {
    console.log(msg);
    if (onLog) onLog(msg);
  };

  try {
    const file = await fileHandle.getFile();
    log(`エクセルファイル「${file.name}」の読み込みを開始します...`);

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // 1. 原本シートの特定
    const templateWs = workbook.worksheets.find(ws => ws.name.replace(/[\s　]+/g, '') === '原本');
    if (!templateWs) {
      throw new Error(`ファイル「${file.name}」内に「原本」シートが見つかりません。保存を中止しました。`);
    }
    log(`テンプレート元シート: 「${templateWs.name}」`);

    // 2. 新規シート名の決定 (YYYYMM, 重複時は (B), (C)...)
    const [yStr, mStr] = month.split('-');
    const baseName = `${yStr}${(mStr || '01').padStart(2, '0')}`; // 例: "202609"

    const existingNames = new Set(workbook.worksheets.map(ws => ws.name.trim()));
    let targetSheetName = baseName;
    if (existingNames.has(targetSheetName)) {
      const letters = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
      let found = false;
      for (const letter of letters) {
        const candidate = `${baseName}（${letter}）`;
        if (!existingNames.has(candidate)) {
          targetSheetName = candidate;
          found = true;
          break;
        }
      }
      if (!found) {
        targetSheetName = `${baseName}_${Date.now().toString().slice(-4)}`;
      }
    }
    log(`新規作成シート名: 「${targetSheetName}」`);

    // 3. 原本シートを末尾に完全複製（クローン）
    // セルごとの大きさ・列幅・行高・外枠縦線・印刷ページ設定を100%忠実に継承
    const newWs = workbook.addWorksheet(targetSheetName);

    // 1) 列設定・列幅の完全複製 (最大列数まで全列確実にコピー)
    const maxCol = Math.max(templateWs.columnCount || 0, templateWs.actualColumnCount || 0, 9);
    for (let c = 1; c <= maxCol; c++) {
      const tCol = templateWs.getColumn(c);
      const nCol = newWs.getColumn(c);
      if (tCol) {
        if (tCol.width !== undefined) nCol.width = tCol.width;
        if (tCol.hidden !== undefined) nCol.hidden = tCol.hidden;
        if (tCol.outlineLevel !== undefined) nCol.outlineLevel = tCol.outlineLevel;
        if (tCol.style && Object.keys(tCol.style).length > 0) {
          nCol.style = JSON.parse(JSON.stringify(tCol.style));
        }
      }
    }

    // 2) ページ設定・印刷設定・ビューの複製（用紙・倍率・ページ数・余白は原本に従う）
    if (templateWs.pageSetup) {
      newWs.pageSetup = JSON.parse(JSON.stringify(templateWs.pageSetup));
    }
    if (templateWs.views) {
      newWs.views = JSON.parse(JSON.stringify(templateWs.views));
    }
    newWs.views = newWs.views.length ? newWs.views.map(view => ({...view, tabSelected: true})) : [{state: 'normal', tabSelected: true}];
    if (templateWs.properties) {
      newWs.properties = JSON.parse(JSON.stringify(templateWs.properties));
    }
    if (templateWs.headerFooter) {
      newWs.headerFooter = JSON.parse(JSON.stringify(templateWs.headerFooter));
    }
    // 値・書式とは別管理の入力規則も複製する。空欄や範囲指定のプルダウンも対象。
    const templateValidations = (templateWs as any).dataValidations.model;
    (newWs as any).dataValidations.model = structuredClone(templateValidations);

    // 3) 行高・セル値・セルスタイル（フォント・罫線・塗りつぶし・配置）の完全複製
    const maxRow = Math.max(templateWs.rowCount || 0, templateWs.actualRowCount || 0, 42);
    for (let r = 1; r <= maxRow; r++) {
      const tRow = templateWs.getRow(r);
      const nRow = newWs.getRow(r);
      if (tRow.height !== undefined) {
        nRow.height = tRow.height;
      }
      if (tRow.hidden !== undefined) {
        nRow.hidden = tRow.hidden;
      }
      for (let c = 1; c <= maxCol; c++) {
        const tCell = tRow.getCell(c);
        const nCell = nRow.getCell(c);
        if (tCell.value !== undefined && tCell.value !== null) {
          nCell.value = tCell.value;
        }
        if (tCell.style && Object.keys(tCell.style).length > 0) {
          nCell.style = JSON.parse(JSON.stringify(tCell.style));
        }
      }
    }

    // 4) 結合セル（merges）の安全な複製
    // mergeCells() だとスレーブセル（右端セルなど）の外枠縦罫線が上書き消滅するため、
    // mergeCellsWithoutStyle() を使用して原本の罫線・外枠を100%維持
    if (templateWs.model && templateWs.model.merges) {
      templateWs.model.merges.forEach(range => {
        try {
          (newWs as any).mergeCellsWithoutStyle(range);
        } catch (e) {
          try {
            newWs.mergeCells(range);
          } catch (e2) {}
        }
      });
    }

    log(`「原本」シートの完全複製（列幅・行高・罫線・原本の印刷設定・結合）が完了しました。`);

    // 4. 新シートに今月のデータを流し込み（セルサイズ・装飾はそのまま、中身のみ設定）
    const writeCell = (address: string, val: any, fontSize?: number) => {
      const cell = newWs.getCell(address);
      cell.value = val;
      if (fontSize !== undefined) {
        cell.font = { ...cell.font, size: fontSize };
      }
    };

    // 児童氏名 (I2)
    writeCell('I2', childName);

    // ※支援目標 (A5) は出力しない（原本の内容を維持）

    // 対象年月 (A10)
    const warekiMonth = parseToWarekiMonth(month);
    writeCell('A10', warekiMonth);

    // データ行 (最大6ブロック)
    const activeRows = existingExcelRows(rows, month);
    for (let k = 0; k < 6; k++) {
      const S = 12 + k * 5;
      const rowData = activeRows[k];

      const addrDate = `A${S}`;
      const addrResult = `E${S}`;
      const addrFuture = `H${S}`;

      if (rowData) {
        // 日にち欄は年は不要（例: 8月12日）
        writeCell(addrDate, formatDisplayDateNoYear(rowData.date), 12);
        const contents = sortSupportContents(rowData.content.supportContent);
        for (let i = 0; i < 5; i++) {
          const val = contents[i];
          if (val && val.trim() !== '') {
            writeCell(`B${S + i}`, val);
          }
        }
        const resText = rowData.content.resultInfo || '';
        writeCell(addrResult, resText, determineFontSize(resText));
        
        const futText = rowData.content.futurePlan || '';
        writeCell(addrFuture, futText, determineFontSize(futText));
      } else {
        writeCell(addrDate, '');
        for (let i = 0; i < 5; i++) {
          // writeCell(`B${S + i}`, ''); // 療育内容はプルダウン等を残すためクリアしない
        }
        writeCell(addrResult, '');
        writeCell(addrFuture, '');
      }
    }

    // フッター (A42)
    // このアプリの「システム設定（専門的支援実施計画）」で設定された作成日・作成者を参照
    let footerDatePart = createdDateText ? createdDateText.trim() : '';
    if (!footerDatePart) {
      footerDatePart = `${parseToWarekiDate(month ? `${month}-01` : undefined)}作成`;
    } else if (!footerDatePart.endsWith('作成')) {
      footerDatePart = `${footerDatePart}作成`;
    }
    const footerText = `${footerDatePart}   作成者：${authorName || ''}`;
    writeCell('A42', footerText);

    log(`シート「${targetSheetName}」へデータを流し込みました。保存処理を実行します...`);

    // 5. 保存
    const generatedBuffer = await workbook.xlsx.writeBuffer();
    const buffer = await preserveExistingExcelSheets(arrayBuffer, generatedBuffer as ArrayBuffer, targetSheetName, templateWs.name);
    await verifyAddedExcelSheet(arrayBuffer, buffer, targetSheetName);
    const writable = await fileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();
    if (verifySavedFile || fileHandle.kind === 'file') {
      const saved = await fileHandle.getFile();
      await verifyAddedExcelSheet(arrayBuffer, await saved.arrayBuffer(), targetSheetName);
      log(`保存先の新規シート「${targetSheetName}」と既存シートの保護を再確認しました。`);
    }

    log(`エクセルファイル「${file.name}」への書き込み・保存が正常に完了しました！`);
    return { sheetName: targetSheetName };
  } catch (err: any) {
    log(`エラー: ${err.message || err}`);
    throw err;
  }
};

/**
 * 個別支援計画書のエクスポート用データ作成
 */
export const exportProfessionalPlan = (
  childName: string,
  plan: any,
  fileName: string
) => {
  const data = [
    { '項目': '利用児氏名', '内容': childName },
    { '項目': '作成年月日', '内容': plan.createdAt },
    { '項目': '生活に対する意向', '内容': plan.familyIntention },
    { '項目': '総合的な支援の方針', '内容': plan.overallPolicy },
    { '項目': '長期目標', '内容': plan.longTermGoal },
    { '項目': '短期目標', '内容': plan.shortTermGoal },
    { '項目': '支援の提供時間等', '内容': plan.serviceHours },
    {}, // 空行
    { 
      'カテゴリ': 'カテゴリ', 
      '支援目標': '支援目標', 
      '支援内容': '支援内容', 
      '5領域': '5領域', 
      '達成時期': '達成時期', 
      '担当者': '担当者', 
      '留意事項': '留意事項', 
      '優先順位': '優先順位' 
    }
  ];

  plan.supportRows.forEach((row: any) => {
    data.push({
      'カテゴリ': row.category,
      '支援目標': row.supportGoal,
      '支援内容': row.supportContent,
      '5領域': row.fiveAreas.join(', '),
      '達成時期': row.achievementPeriod,
      '担当者': row.provider,
      '留意事項': row.notes,
      '優先順位': row.priority
    });
  });

  const worksheet = XLSX.utils.json_to_sheet(data, { skipHeader: true });

  // 列幅の調整
  worksheet['!cols'] = [
    { wch: 12 }, // カテゴリ
    { wch: 30 }, // 支援目標
    { wch: 40 }, // 支援内容
    { wch: 25 }, // 5領域
    { wch: 12 }, // 達成時期
    { wch: 20 }, // 担当者
    { wch: 30 }, // 留意事項
    { wch: 10 }  // 優先順位
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '支援計画');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
