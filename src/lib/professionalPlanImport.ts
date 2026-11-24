import {professionalVariantSuffix} from './professionalPlanDraft';
import {professionalHoursStartDate} from './professionalHoursStartDate';
import * as XLSX from 'xlsx';
import {professionalPlanSheetStatus} from './professionalPlanSheetStatus';
import type {ProfessionalPlanDoc,SupportRow,ServiceHoursPlan,DaySchedule,SupportCategory} from '../types/professionalPlan';
export type ParsedPeriodData = {
  startMonth: string;
  variantIndex?:number;
  draftPlan?: ProfessionalPlanDoc;
  finalPlan?: ProfessionalPlanDoc;
  serviceHours?: ServiceHoursPlan;
  rawPlanDate?: string;
  rawHoursDate?: string;
  hoursSheetName?:string;
  hoursPlanSheetName?:string;
  hoursEffectiveStart?:string;
  skipImport?: boolean;
};

  const parseKanjiDate = (rawVal: string): { formattedDate: string, yearMonth: string } | null => {
    if (!rawVal) return null;
    const cleanVal = rawVal.trim().replace(/[\s　]+/g, '');

    // 1) 令和・R などの和暦 (例: 令和8年6月1日)
    const reiwaMatch = cleanVal.match(/(?:令和|R)\s*(\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/i);
    if (reiwaMatch) {
      const y = 2018 + parseInt(reiwaMatch[1], 10);
      const m = reiwaMatch[2].padStart(2, '0');
      const d = reiwaMatch[3].padStart(2, '0');
      return { formattedDate: `${y}-${m}-${d}`, yearMonth: `${y}-${m}` };
    }

    // 2) 平成・H などの和暦
    const heiseiMatch = cleanVal.match(/(?:平成|H)\s*(\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/i);
    if (heiseiMatch) {
      const y = 1988 + parseInt(heiseiMatch[1], 10);
      const m = heiseiMatch[2].padStart(2, '0');
      const d = heiseiMatch[3].padStart(2, '0');
      return { formattedDate: `${y}-${m}-${d}`, yearMonth: `${y}-${m}` };
    }

    // 3) 西暦 (例: 2026年6月1日)
    const seirekiMatch = cleanVal.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (seirekiMatch) {
      const y = seirekiMatch[1];
      const m = seirekiMatch[2].padStart(2, '0');
      const d = seirekiMatch[3].padStart(2, '0');
      return { formattedDate: `${y}-${m}-${d}`, yearMonth: `${y}-${m}` };
    }

    // 4) Dateオブジェクトでのパース
    const dObj = new Date(rawVal);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getFullYear();
      const m = String(dObj.getMonth() + 1).padStart(2, '0');
      const d = String(dObj.getDate()).padStart(2, '0');
      return { formattedDate: `${y}-${m}-${d}`, yearMonth: `${y}-${m}` };
    }

    // 5) YYYY-MM-DD や YYYY-MM
    const simpleMatch = cleanVal.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if (simpleMatch) {
      const y = simpleMatch[1];
      const m = simpleMatch[2].padStart(2, '0');
      const d = (simpleMatch[3] || '01').padStart(2, '0');
      return { formattedDate: `${y}-${m}-${d}`, yearMonth: `${y}-${m}` };
    }

    return null;
  };

  const parseMonthFromSheetName = (sheetName: string): string | null => {
    const cleanName = sheetName.replace(/[\s　]+/g, '');
    if (cleanName === '原本' || cleanName.includes('原本')) return null;

    // 1) "YYYY-MM" または "YYYYMM"
    const yyyymmMatch = cleanName.match(/^(\d{4})[-_/]?(\d{2})/);
    if (yyyymmMatch) {
      return `${yyyymmMatch[1]}-${yyyymmMatch[2].padStart(2, '0')}`;
    }

    // 2) "YYYY年MM月"
    const yyyymmKanjiMatch = cleanName.match(/^(\d{4})年(\d{1,2})月/);
    if (yyyymmKanjiMatch) {
      return `${yyyymmKanjiMatch[1]}-${yyyymmKanjiMatch[2].padStart(2, '0')}`;
    }

    // 3) "MM月案" または "MM月" や "MM" (西暦年なしの場合。現在の年をデフォルトとする)
    const mmMatch = cleanName.match(/^(\d{1,2})月?/);
    if (mmMatch) {
      const monthVal = mmMatch[1].padStart(2, '0');
      const currentYear = new Date().getFullYear();
      return `${currentYear}-${monthVal}`;
    }

    return null;
  };

  const findCellCoordinate = (grid: any[][], text: string): { r: number, c: number } | null => {
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().replace(/[\s　\n\r]+/g, '');
        const cleanText = text.replace(/[\s　\n\r]+/g, '');
        if (val.includes(cleanText)) {
          return { r, c };
        }
      }
    }
    return null;
  };

  const getMergedCellValue = (grid: any[][], r: number, c: number, scanRightMax = 4): string => {
    // 結合セルを考慮し、指定座標から右側をスキャンして非空文字列を取得
    for (let offset = 0; offset < scanRightMax; offset++) {
      const val = String(grid[r]?.[c + offset] || '').trim();
      if (val) return val;
    }
    return '';
  };

  const parseTimeRange = (text: string): { start: string, end: string, minutes: number } => {
    if (!text || text === '─' || text === '-' || (!text.includes('~') && !text.includes('～'))) {
      return { start: '', end: '', minutes: 0 };
    }
    
    const cleanText = text.replace(/[\s　]+/g, '').replace('～', '~');
    const parts = cleanText.split('~');
    
    if (parts.length === 2) {
      const normalizeToHHMM = (t: string): { hhmm: string; minutes: number } => {
        const cleanT = t.trim();
        
        // 1) Excelシリアル値（小数）の表記 (例: 0.6458333...)
        const serialMatch = cleanT.match(/^(0\.\d+)/);
        if (serialMatch) {
          const num = parseFloat(serialMatch[1]);
          const totalSeconds = Math.round(num * 86400);
          const h = Math.floor(totalSeconds / 3600);
          const m = Math.floor((totalSeconds % 3600) / 60);
          const hh = String(h).padStart(2, '0');
          const mm = String(m).padStart(2, '0');
          return {
            hhmm: `${hh}:${mm}`,
            minutes: h * 60 + m
          };
        }
        
        // 2) "15時30分" や "15時30" などの表記
        const kanjiMatch = cleanT.match(/(\d{1,2})\s*時\s*(?:(\d{1,2})\s*分?)?/);
        if (kanjiMatch) {
          const h = parseInt(kanjiMatch[1], 10);
          const m = parseInt(kanjiMatch[2] || '0', 10);
          const hh = String(h).padStart(2, '0');
          const mm = String(m).padStart(2, '0');
          return {
            hhmm: `${hh}:${mm}`,
            minutes: h * 60 + m
          };
        }
        
        // 2) "15:30" などの表記
        const colonMatch = cleanT.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
        if (colonMatch) {
          const h = parseInt(colonMatch[1], 10);
          const m = parseInt(colonMatch[2], 10);
          const hh = String(h).padStart(2, '0');
          const mm = String(m).padStart(2, '0');
          return {
            hhmm: `${hh}:${mm}`,
            minutes: h * 60 + m
          };
        }

        return { hhmm: '', minutes: 0 };
      };

      const startParsed = normalizeToHHMM(parts[0]);
      const endParsed = normalizeToHHMM(parts[1]);
      
      const diff = endParsed.minutes - startParsed.minutes;
      
      return {
        start: startParsed.hhmm,
        end: endParsed.hhmm,
        minutes: diff > 0 ? diff : 0
      };
    }
    
    return { start: '', end: '', minutes: 0 };
  };

  const PROVIDER_DEFAULT_FALLBACK = (cat: SupportCategory) => {
    return cat === '移行支援' ? 'TreeKidsSchool' : 'TreeKidsSchool\nSearch';
  };

  const defaultDaySchedule = (): DaySchedule => ({
    startTime: '',
    endTime: '',
    totalMinutes: 0,
    beforeExtStartTime: '',
    beforeExtEndTime: '',
    beforeExtMinutes: 0,
    afterExtStartTime: '',
    afterExtEndTime: '',
    afterExtMinutes: 0
  });

export function parseProfessionalWorkbook(wb:XLSX.WorkBook, childId:string) {
    const logs: string[] = [];
    try {
      logs.push(`Excelの解析を開始しました。ファイル内シート数: ${wb.SheetNames.length}枚`);
      const periods: Record<string, ParsedPeriodData> = {};

      const periodFor=(month:string,kind:'draftPlan'|'finalPlan'|'serviceHours')=>{
        let index=0;
        while(periods[month+professionalVariantSuffix(index)]?.[kind])index++;
        const key=month+professionalVariantSuffix(index);
        return periods[key] ||= {startMonth:month,variantIndex:index};
      };

      // 1. まず全計画書シート（案・本案）をスキャンして月をリストアップ
      const planSheets: { sheetName: string; month: string; status: 'draft' | 'final' }[] = [];
      wb.SheetNames.forEach(sheetName => {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return;
        const {status:titleStatus, title} = professionalPlanSheetStatus(sheet);
        const nameHasDraft=/(?:案|\(案\)|【案】|\[案\])$/.test(sheetName.normalize('NFKC').replace(/[\s　]+/g,''));
        const status=nameHasDraft?'draft':titleStatus;
        const isDraft = status === 'draft';
        const month = parseMonthFromSheetName(sheetName);
        if (month && !/(利用時間|別表|提供時間|スケジュール)/.test(sheetName)) {
          planSheets.push({
            sheetName,
            month,
            status
          });
          logs.push(`計画書シート検出: 「${sheetName}」→ 対象期 ${month} (${isDraft ? '案' : '本案'}・${nameHasDraft ? 'シート名の案で判定' : title ? 'シート内の表題で判定' : '案の表記なし'})`);
        }
      });

      // 3. 各計画書シートのパース
      planSheets.forEach(({ sheetName, month, status }) => {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return;

        const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false });
        const cleanGrid = grid.map(row => Array.isArray(row) ? Array.from(row) : []);

        // パース処理
        const createdDateCoord = findCellCoordinate(cleanGrid, '作成年月日');
        let createdAt = `${month}-01`;
        let rawPlanDate = '';
        if (createdDateCoord) {
          const selfVal = String(cleanGrid[createdDateCoord.r]?.[createdDateCoord.c] || '').trim();
          let rawVal = '';
          
          const cleanSelf = selfVal.replace(/作成年月日[：: \s　]*/g, '');
          if (cleanSelf && cleanSelf.length > 2) {
            rawVal = cleanSelf;
          } else {
            rawVal = getMergedCellValue(cleanGrid, createdDateCoord.r, createdDateCoord.c + 1);
          }

          if (rawVal) {
            rawPlanDate = rawVal;
            const dateObj = parseKanjiDate(rawVal);
            if (dateObj) {
              createdAt = dateObj.formattedDate;
            }
          }
        }

        const intentionCoord = findCellCoordinate(cleanGrid, '意向');
        const familyIntention = intentionCoord ? getMergedCellValue(cleanGrid, intentionCoord.r, intentionCoord.c + 1, 6) : '';

        const policyCoord = findCellCoordinate(cleanGrid, '総合的な支援の方針');
        const overallPolicy = policyCoord ? getMergedCellValue(cleanGrid, policyCoord.r, policyCoord.c + 1, 6) : '';

        const longTermCoord = findCellCoordinate(cleanGrid, '長期目標');
        const longTermGoal = longTermCoord ? getMergedCellValue(cleanGrid, longTermCoord.r, longTermCoord.c + 1, 6) : '';

        const shortTermCoord = findCellCoordinate(cleanGrid, '短期目標');
        const shortTermGoal = shortTermCoord ? getMergedCellValue(cleanGrid, shortTermCoord.r, shortTermCoord.c + 1, 6) : '';

        const hoursCoord = findCellCoordinate(cleanGrid, '支援の標準的な提供時間等');
        const serviceHours = hoursCoord ? getMergedCellValue(cleanGrid, hoursCoord.r + 1, hoursCoord.c, 4) : '';

        const confirmCoord = findCellCoordinate(cleanGrid, '確認事項');
        const confirmation = confirmCoord ? getMergedCellValue(cleanGrid, confirmCoord.r, confirmCoord.c + 1, 8) : '';

        const managerCoord = findCellCoordinate(cleanGrid, '児童発達支援管理責任者氏名');
        const managerName = managerCoord ? getMergedCellValue(cleanGrid, managerCoord.r, managerCoord.c + 1, 4) : '';

        const signDateCoord = findCellCoordinate(cleanGrid, '保護者署名');
        let signDate = createdAt;
        if (signDateCoord) {
          const rawVal = getMergedCellValue(cleanGrid, signDateCoord.r + 1, signDateCoord.c);
          if (rawVal && !rawVal.includes('年月日')) {
            const dateObj = parseKanjiDate(rawVal);
            if (dateObj) {
              signDate = dateObj.formattedDate;
            }
          }
        }

        // 支援目標テーブルのパース
        let tableHeaderRowIdx = -1;
        for (let r = 0; r < cleanGrid.length; r++) {
          const row = cleanGrid[r];
          if (!row) continue;
          const cleanCells = row.map(v => String(v || '').trim().replace(/[\s　\r\n]+/g, ''));
          const hasItem = cleanCells.some(v => v.includes('項目') || v === '項');
          const hasGoal = cleanCells.some(v => v.includes('支援目標'));
          if (hasItem && hasGoal) {
            tableHeaderRowIdx = r;
            break;
          }
        }

        const supportRows: SupportRow[] = [];
        if (tableHeaderRowIdx !== -1) {
          const row = cleanGrid[tableHeaderRowIdx];
          const cleanRow = row.map(v => String(v || '').trim().replace(/[\s　\r\n]+/g, ''));
          
          const categoryIdx = cleanRow.findIndex(v => v.includes('項目') || v === '項');
          const goalIdx = cleanRow.findIndex(v => v.includes('支援目標'));
          const contentIdx = cleanRow.findIndex(v => v.includes('支援内容'));
          const periodIdx = cleanRow.findIndex(v => v.includes('達成時期'));
          const providerIdx = cleanRow.findIndex(v => v.includes('担当者') || v.includes('提供機関'));
          const notesIdx = cleanRow.findIndex(v => v.includes('留意事項'));
          const priorityIdx = cleanRow.findIndex(v => v.includes('優先順位'));

          let currentCategory: SupportCategory = '本人支援';

          const FIVE_AREAS = ['健康・生活', '運動・感覚', '認知・行動', '言語・コミュニケーション', '人間関係・社会性'];

          for (let r = tableHeaderRowIdx + 1; r < cleanGrid.length; r++) {
            const rData = cleanGrid[r];
            if (!rData || rData.length === 0) continue;

            const categoryVal = String(rData[categoryIdx] || '').trim();
            if (categoryVal === '本人支援' || categoryVal === '家族支援' || categoryVal === '移行支援') {
              currentCategory = categoryVal;
            }

            const goalVal = String(rData[goalIdx] || '').trim();
            const contentVal = String(rData[contentIdx] || '').trim();
            const periodVal = String(rData[periodIdx] || '').trim();
            const providerVal = String(rData[providerIdx] || '').trim();
            const notesVal = String(rData[notesIdx] || '').trim();
            const priorityVal = String(rData[priorityIdx] || '').trim();

            // 終了判定（テーブル外の余分な行を巻き込まないようにする）
            const rowText = rData.map(v => String(v || '').trim()).join('');
            if (
              rowText.includes('領域の視点') || 
              rowText.includes('確認事項') || 
              rowText.includes('説明しました') || 
              rowText.includes('同意しました') ||
              rowText.includes('保護者署名') ||
              rowText.includes('児童発達支援管理責任者')
            ) {
              break;
            }

            if (goalVal.includes('確認事項') || contentVal.includes('説明しました')) {
              break;
            }

            if (goalVal || contentVal) {
              // 支援内容のすぐ右隣の列から5領域テキストを取得
              const fiveAreasText = contentIdx !== -1 ? String(rData[contentIdx + 1] || '').trim() : '';

              // 5領域の自動チェック（本人支援のみ）
              const detectedAreas = currentCategory === '本人支援'
                ? FIVE_AREAS.filter(area => {
                    const keywords = area.split('・');
                    return keywords.some(kw => 
                      fiveAreasText.includes(kw) || contentVal.includes(kw)
                    );
                  })
                : [];

              supportRows.push({
                id: crypto.randomUUID(),
                category: currentCategory,
                supportGoal: goalVal,
                supportContent: contentVal,
                fiveAreas: detectedAreas,
                achievementPeriod: periodVal || '6ヶ月',
                provider: providerVal || PROVIDER_DEFAULT_FALLBACK(currentCategory),
                notes: notesVal,
                priority: priorityVal || (supportRows.filter(sr => sr.category === currentCategory).length + 1).toString()
              });
            }
          }
        }

        const parsedPlan: ProfessionalPlanDoc = {
          childId,
          createdAt,
          startMonth: month,
          status,
          familyIntention,
          overallPolicy,
          longTermGoal,
          shortTermGoal,
          serviceHours,
          supportRows,
          confirmation,
          managerName,
          signDate,
          guardianName: ''
        };

        const period=periodFor(month,status==='draft'?'draftPlan':'finalPlan');
        parsedPlan.variantIndex=period.variantIndex;
        if(rawPlanDate)period.rawPlanDate=rawPlanDate;
        if(status==='draft')period.draftPlan=parsedPlan;else period.finalPlan=parsedPlan;
      });

      // 4. 利用時間（別表）シートのパース
      logs.push("利用時間シートのスキャンを開始します...");
      wb.SheetNames.forEach(sheetName => {
        const cleanName = sheetName.replace(/[\s　]+/g, '');
        // 判定条件を大幅に緩和
        const isHoursSheet = cleanName.includes('利用時間') || 
                             cleanName.includes('別表') || 
                             cleanName.includes('提供時間') ||
                             cleanName.includes('時間') ||
                             cleanName.includes('スケジュール');

        if (isHoursSheet && !cleanName.includes('原本')) {
          logs.push(`利用時間候補シート「${sheetName}」を検出しました。パースを開始します。`);
          const sheet = wb.Sheets[sheetName];
          if (!sheet) {
            logs.push(`警告: シート「${sheetName}」の取得に失敗しました。`);
            return;
          }

          const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false });
          const cleanGrid = grid.map(row => Array.isArray(row) ? Array.from(row) : []);

          const effective=professionalHoursStartDate(sheet,!!wb.Workbook?.WBProps?.date1904);
          if(!effective.date){logs.push('警告: 利用時間「'+sheetName+'」は開始年月日が'+(effective.found?'読み取れない':'ない')+'ため取り込みません。');return;}
          const month=effective.date.slice(0,7);
          const createdDateCoord=findCellCoordinate(cleanGrid,'作成日');
          const rawHoursDate=createdDateCoord?getMergedCellValue(cleanGrid,createdDateCoord.r,createdDateCoord.c+1):'';
          logs.push('利用時間「'+sheetName+'」の開始年月日 '+effective.date+' → 適用開始月 '+month);

          let weekHeaderRowIdx = -1;
          for (let r = 0; r < cleanGrid.length; r++) {
            const row = cleanGrid[r];
            if (!row) continue;
            const cleanCells = row.map(v => String(v || '').trim().replace(/[\s　]+/g, ''));
            const days = ['月', '火', '水', '木', '金'];
            
            // "月曜日" や "(月)" や "月" を含む部分一致に対応
            const count = days.filter(d => 
              cleanCells.some(cell => {
                const norm = cell.replace(/曜日/g, '');
                return norm === d || norm === `(${d})` || (cell.includes(d) && cell.length <= 4);
              })
            ).length;

            if (count >= 4) {
              weekHeaderRowIdx = r;
              break;
            }
          }

          if (weekHeaderRowIdx === -1) {
            logs.push(`  エラー: シート「${sheetName}」に「月〜金」の曜日ヘッダー行を検出できませんでした。スキップします。`);
            return;
          }

          logs.push(`  → 曜日ヘッダーを ${weekHeaderRowIdx + 1} 行目に検出しました。`);

          const dayColIndices: Record<string, number> = {};
          const daysOfWeek = ['月', '火', '水', '木', '金', '土', '日'];
          const weekHeaderRow = cleanGrid[weekHeaderRowIdx] || [];
          daysOfWeek.forEach(d => {
            dayColIndices[d] = weekHeaderRow.findIndex(v => {
              const norm = String(v || '').trim().replace(/[\s　]+/g, '').replace(/曜日/g, '');
              // "日" が "日・祝日" や "土" が "土曜" にマッチするように部分一致を使用
              return norm.includes(d);
            });
          });

          // 曜日インデックス検出結果をログ出力
          const indexLog = daysOfWeek.map(d => `${d}曜:${dayColIndices[d]}列`).join(', ');
          logs.push(`  → 曜日列検出: ${indexLog}`);

          let provideTimeRowIdx = -1;
          let beforeExtRowIdx = -1;
          let afterExtRowIdx = -1;
          for (let r = weekHeaderRowIdx + 1; r < cleanGrid.length; r++) {
            const row = cleanGrid[r];
            if (!row) continue;
            
            const cleanCells = row.map(v => String(v || '').trim().replace(/[\s　\n\r]+/g, ''));

            // 左端の結合セルの注釈文言による誤判定を避けるため、曜日セルのラベル存在を最優先で確認する
            const hasProvideLabel = cleanCells.some(cell => cell.includes('利用開始') || cell.includes('提供時間'));
            const hasBeforeLabel = cleanCells.some(cell => cell.includes('【支援前】') || cell.includes('支援前延長'));
            const hasAfterLabel = cleanCells.some(cell => cell.includes('【支援後】') || cell.includes('支援後延長'));

            if (hasProvideLabel && provideTimeRowIdx === -1) {
              provideTimeRowIdx = r;
            }
            if (hasBeforeLabel && beforeExtRowIdx === -1) {
              beforeExtRowIdx = r;
            }
            if (hasAfterLabel && afterExtRowIdx === -1) {
              afterExtRowIdx = r;
            }
          }

          logs.push(`  → 行検出: 提供時間見出し行=${provideTimeRowIdx !== -1 ? provideTimeRowIdx + 1 : '未検出'}, 支援前延長見出し行=${beforeExtRowIdx !== -1 ? beforeExtRowIdx + 1 : '未検出'}, 支援後延長見出し行=${afterExtRowIdx !== -1 ? afterExtRowIdx + 1 : '未検出'}`);

          const isTimeValue = (val: string): boolean => {
            if (!val) return false;
            const cleanVal = val.trim();
            // 数字が一切含まれない文字列は時間値ではない
            if (!/\d+/.test(cleanVal)) {
              return false;
            }
            // 時間帯を表す記号（~ または ～）が含まれていることを必須とする
            if (cleanVal.includes('~') || cleanVal.includes('～')) {
              return true;
            }
            return false;
          };

          const getRowDataValue = (baseRowIdx: number, colIdx: number, nextHeaderRowIdx: number = -1): string => {
            if (baseRowIdx === -1) return '';
            
            // 探索する行の最大インデックス（次の見出し行の手前、または最大3行）
            const maxRow = nextHeaderRowIdx !== -1 ? nextHeaderRowIdx : baseRowIdx + 3;
            
            for (let r = baseRowIdx; r < Math.min(cleanGrid.length, maxRow); r++) {
              // 曜日エリアの3列分の値を結合する
              const parts: string[] = [];
              for (let cOffset = 0; cOffset <= 2; cOffset++) {
                const c = colIdx + cOffset;
                const cellVal = String(cleanGrid[r]?.[c] || '').trim();
                if (cellVal) {
                  parts.push(cellVal);
                }
              }
              const combinedVal = parts.join(' ').trim();
              if (isTimeValue(combinedVal)) {
                return combinedVal;
              }
            }
            return '';
          };

          const weeklyHours: Record<string, DaySchedule> = {};
          daysOfWeek.forEach(day => {
            const col = dayColIndices[day];
            if (col === -1 || col === undefined) {
              weeklyHours[day] = defaultDaySchedule();
              return;
            }

            const rawProvide = getRowDataValue(provideTimeRowIdx, col, beforeExtRowIdx);
            const rawBefore = getRowDataValue(beforeExtRowIdx, col, afterExtRowIdx);
            const rawAfter = getRowDataValue(afterExtRowIdx, col, -1);

            const provideParsed = parseTimeRange(rawProvide);
            const beforeParsed = parseTimeRange(rawBefore);
            const afterParsed = parseTimeRange(rawAfter);

            if ((rawProvide && rawProvide !== '～' && rawProvide !== '─') || 
                (rawBefore && rawBefore !== '～' && rawBefore !== '─') || 
                (rawAfter && rawAfter !== '～' && rawAfter !== '─')) {
              logs.push(`    - ${day}曜: 提供原データ="${rawProvide}"→[${provideParsed.start}~${provideParsed.end}] (${provideParsed.minutes}分), 送迎前="${rawBefore}", 送迎後="${rawAfter}"`);
            }

            weeklyHours[day] = {
              startTime: provideParsed.start,
              endTime: provideParsed.end,
              totalMinutes: provideParsed.minutes,
              beforeExtStartTime: beforeParsed.start,
              beforeExtEndTime: beforeParsed.end,
              beforeExtMinutes: beforeParsed.minutes,
              afterExtStartTime: afterParsed.start,
              afterExtEndTime: afterParsed.end,
              afterExtMinutes: afterParsed.minutes
            };
          });

          const extReasonCoord = findCellCoordinate(cleanGrid, '延長を必要とする理由');
          const extReason = extReasonCoord ? getMergedCellValue(cleanGrid, extReasonCoord.r, extReasonCoord.c + 1, 8) : '';

          const notesCoord = findCellCoordinate(cleanGrid, '特記事項');
          const notes = notesCoord ? getMergedCellValue(cleanGrid, notesCoord.r, notesCoord.c + 1, 8) : '';

          let createdAt = `${month}-01`;
          if (createdDateCoord) {
            const rawVal = getMergedCellValue(cleanGrid, createdDateCoord.r, createdDateCoord.c + 1);
            if (rawVal) {
              const dateObj = parseKanjiDate(rawVal);
              if (dateObj) {
                createdAt = dateObj.formattedDate;
              }
            }
          }

          const parsedHours: ServiceHoursPlan = {
            ...(effective.date?{effectiveStartDate:effective.date}:{}),
            childId,
            startMonth: month,
            createdAt,
            weeklyHours,
            extReason,
            notes
          };

          const period=periodFor(month,'serviceHours');
          parsedHours.variantIndex=period.variantIndex;
          period.rawHoursDate=rawHoursDate;period.hoursSheetName=sheetName;
          period.hoursPlanSheetName=planSheets.find(plan=>plan.status==='final'&&plan.month===month)?.sheetName;
          period.hoursEffectiveStart=effective.date;period.serviceHours=parsedHours;
          logs.push(`  → シート「${sheetName}」の利用時間データの抽出に成功しました (対象月: ${month})。`);
        }
      });

      logs.push(`Excelのパース処理が成功しました。検出月数: ${Object.keys(periods).length}ヶ月`);
      if(!Object.keys(periods).length)throw new Error('取り込み可能な計画書・利用時間シートが見つかりませんでした。');
      for(const {startMonth:month} of Object.values(periods))if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('対象月を特定できませんでした：'+month);
      return {periods, logs};
    } catch (err: any) {
      throw new Error(err.message || "計画シートのパースに失敗しました。");
    }
  };

