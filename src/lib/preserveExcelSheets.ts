import JSZip from 'jszip';

// ExcelJS が生成した新シートだけを元の xlsx に追加する。
// 既存のシートXMLと、そのシートが参照する書式・文字列のIDは変更しない。
const attr = (xml: string, name: string): string =>
  xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '';
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nodes = (xml: string, tag: string): string[] =>
  xml.match(new RegExp(`<${tag}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${tag}>)`, 'g')) || [];
const section = (xml: string, tag: string): string =>
  xml.match(new RegExp(`<${tag}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${tag}>)`))?.[0] || '';
const appendTo = (xml: string, tag: string, value: string): string => {
  if (xml.includes(`</${tag}>`)) return xml.replace(`</${tag}>`, `${value}</${tag}>`);
  const empty = new RegExp(`<${tag}\\b([^>]*)\\/>`);
  if (empty.test(xml)) return xml.replace(empty, `<${tag}$1>${value}</${tag}>`);
  throw new Error(`Excelの${tag}情報を読み取れません。元ファイルは変更していません。`);
};

const styleOrder = ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs', 'tableStyles', 'colors', 'extLst'];
function setStyleSection(xml: string, tag: string, items: string[]): string {
  const replacement = `<${tag} count="${items.length}">${items.join('')}</${tag}>`;
  const existing = section(xml, tag);
  if (existing) return xml.replace(existing, replacement);
  for (const next of styleOrder.slice(styleOrder.indexOf(tag) + 1)) {
    const following = section(xml, next);
    if (following) return xml.replace(following, replacement + following);
  }
  return appendTo(xml, 'styleSheet', replacement);
}

function mergeStyles(original: string, generated: string): { xml: string; styleMap: number[]; dxfMap: number[] } {
  let xml = original;
  const oldFormats = nodes(section(original, 'numFmts'), 'numFmt');
  const formats = [...oldFormats];
  const formatIds = new Map(oldFormats.map(node => [Number(attr(node, 'numFmtId')), attr(node, 'formatCode')]));
  const formatMap = new Map<number, number>();
  let nextFormatId = Math.max(163, ...formatIds.keys()) + 1;
  for (const node of nodes(section(generated, 'numFmts'), 'numFmt')) {
    const id = Number(attr(node, 'numFmtId'));
    const code = attr(node, 'formatCode');
    const equivalent = [...formatIds].find(([, value]) => value === code);
    const target = equivalent?.[0] ?? nextFormatId++;
    formatMap.set(id, target);
    if (!equivalent) {
      formats.push(node.replace(/\bnumFmtId="\d+"/, `numFmtId="${target}"`));
      formatIds.set(target, code);
    }
  }
  if (formats.length) xml = setStyleSection(xml, 'numFmts', formats);
  const maps: Record<string, number[]> = {};
  for (const [tag, child] of [['fonts', 'font'], ['fills', 'fill'], ['borders', 'border'], ['cellStyleXfs', 'xf'], ['cellXfs', 'xf'], ['dxfs', 'dxf']]) {
    const existing = nodes(section(original, tag), child);
    const combined = [...existing];
    maps[tag] = [];
    const indices = new Map(existing.map((node, index) => [node, index]));
    nodes(section(generated, tag), child).forEach(node => {
      let mapped = node.replace(/\b(fontId|fillId|borderId|xfId)="(\d+)"/g, (_, key: string, value: string) => {
        const collection = {fontId: 'fonts', fillId: 'fills', borderId: 'borders', xfId: 'cellStyleXfs'}[key]!;
        return `${key}="${maps[collection]?.[Number(value)] ?? value}"`;
      });
      mapped = mapped.replace(/\bnumFmtId="(\d+)"/g, (_, value: string) => `numFmtId="${formatMap.get(Number(value)) ?? value}"`);
      let index = indices.get(mapped);
      if (index === undefined) {
        index = combined.length;
        indices.set(mapped, index);
        combined.push(mapped);
      }
      maps[tag].push(index);
    });
    if (combined.length > existing.length) xml = setStyleSection(xml, tag, combined);
  }
  return {xml, styleMap: maps.cellXfs, dxfMap: maps.dxfs};
}

const worksheetOrder = ['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst'];
const layoutTags = ['sheetPr','dimension','sheetViews','sheetFormatPr','cols','mergeCells','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','legacyDrawingHF'];
function restoreTemplateLayout(generated:string, template:string):string {
  let xml = generated;
  for (const tag of layoutTags) {
    const source = section(template,tag), current = section(xml,tag);
    if (current) {xml=xml.replace(current,source);continue;}
    if (!source) continue;
    const following=worksheetOrder.slice(worksheetOrder.indexOf(tag)+1).map(next=>section(xml,next)).find(Boolean);
    xml = following ? xml.replace(following,source+following) : appendTo(xml,'worksheet',source);
  }
  const rowAttributes = new Map(nodes(section(template,'sheetData'),'row').map(row=>[attr(row,'r'),row.match(/^<row\b[^>]*?\/?>/)![0].replace(/\/?>$/, '>')]));
  xml=xml.replace(/<row\b[^>]*?\/?>/g, row=>{
    const source=rowAttributes.get(attr(row,'r'));
    return source ? (row.endsWith('/>') ? source.replace(/>$/, '/>') : source) : row;
  });
  return xml;
}

/** 元ファイルの既存シートは再生成せず、追加シートと必要な参照情報だけを移植する。 */
export async function preserveExistingExcelSheets(originalBuffer: ArrayBuffer, generatedBuffer: ArrayBuffer, sheetName: string, templateName?: string): Promise<Uint8Array> {
  const original = await JSZip.loadAsync(originalBuffer);
  const generated = await JSZip.loadAsync(generatedBuffer);
  const read = async (zip: JSZip, path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error(`Excelの${path}が見つかりません。元ファイルは変更していません。`);
    return file.async('string');
  };
  let workbook = await read(original, 'xl/workbook.xml');
  let relationships = await read(original, 'xl/_rels/workbook.xml.rels');
  let contentTypes = await read(original, '[Content_Types].xml');
  const originalSheetNodes=nodes(workbook,'sheet');
  const templateIndex=originalSheetNodes.findIndex(node=>templateName ? attr(node,'name')===escapeXml(templateName) : attr(node,'name').replace(/[\s　]+/g,'')==='原本');
  const templateRelation=templateIndex>=0 ? nodes(relationships,'Relationship').find(node=>attr(node,'Id')===attr(originalSheetNodes[templateIndex],'r:id')) : undefined;
  const templatePath=templateRelation ? (attr(templateRelation,'Target').startsWith('/') ? attr(templateRelation,'Target').slice(1) : 'xl/'+attr(templateRelation,'Target')) : '';
  const templateXml=templatePath ? await read(original,templatePath) : '';
  const generatedWorkbook = await read(generated, 'xl/workbook.xml');
  const generatedRelationships = await read(generated, 'xl/_rels/workbook.xml.rels');
  const sheet = nodes(generatedWorkbook, 'sheet').find(node => attr(node, 'name') === escapeXml(sheetName));
  const sheetRelation = sheet && nodes(generatedRelationships, 'Relationship').find(node => attr(node, 'Id') === attr(sheet, 'r:id'));
  if (!sheetRelation) throw new Error('追加するシートを特定できません。元ファイルは変更していません。');
  const resolveTarget = (target: string) => target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const generatedSheetPath = resolveTarget(attr(sheetRelation, 'Target'));
  let newSheetXml = await read(generated, generatedSheetPath);
  let sheetNumber = 1;
  while (original.file(`xl/worksheets/sheet${sheetNumber}.xml`)) sheetNumber++;
  const sheetPath = `xl/worksheets/sheet${sheetNumber}.xml`;
  let nextRelationship = 1;
  const ids = new Set(nodes(relationships, 'Relationship').map(node => attr(node, 'Id')));
  const addRelationship = (type: string, target: string) => {
    while (ids.has(`rId${nextRelationship}`)) nextRelationship++;
    const id = `rId${nextRelationship++}`;
    ids.add(id);
    relationships = appendTo(relationships, 'Relationships', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`);
    return id;
  };
  const addContentType = (path: string, type: string) => {
    contentTypes = appendTo(contentTypes, 'Types', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml"/>`);
  };

  const originalStyles = original.file('xl/styles.xml');
  const generatedStyles = await read(generated, 'xl/styles.xml');
  if (originalStyles) {
    const merged = mergeStyles(await originalStyles.async('string'), generatedStyles);
    original.file('xl/styles.xml', merged.xml);
    newSheetXml = newSheetXml.replace(/\bs="(\d+)"/g, (_, id: string) => `s="${merged.styleMap[Number(id)] ?? id}"`)
      .replace(/\bstyle="(\d+)"/g, (_, id: string) => `style="${merged.styleMap[Number(id)] ?? id}"`)
      .replace(/<c\b([^>]*?)(\/?>)/g, (node, attributes: string, closing: string) =>
        /\bs="/.test(attributes) ? node : `<c${attributes} s="${merged.styleMap[0] ?? 0}"${closing}`)
      .replace(/\bdxfId="(\d+)"/g, (_, id: string) => `dxfId="${merged.dxfMap[Number(id)] ?? id}"`);
  } else {
    original.file('xl/styles.xml', generatedStyles);
    addRelationship('styles', 'styles.xml');
    addContentType('xl/styles.xml', 'styles');
  }

  const generatedStrings = generated.file('xl/sharedStrings.xml');
  if (generatedStrings) {
    const incoming = nodes(await generatedStrings.async('string'), 'si');
    const originalStrings = original.file('xl/sharedStrings.xml');
    const oldXml = originalStrings ? await originalStrings.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></sst>';
    const oldItems = nodes(oldXml, 'si');
    const combined = [...oldItems];
    const stringIndices = new Map(oldItems.map((node, index) => [node, index]));
    const stringMap = incoming.map(node => {
      let index = stringIndices.get(node);
      if (index === undefined) {
        index = combined.length;
        stringIndices.set(node, index);
        combined.push(node);
      }
      return index;
    });
    newSheetXml = newSheetXml.replace(/<c\b([^>]*\bt="s"[^>]*)>([\s\S]*?)<\/c>/g, (_, attributes: string, inner: string) =>
      `<c${attributes}>${inner.replace(/<v>(\d+)<\/v>/, (_v, id: string) => `<v>${stringMap[Number(id)]}</v>`)}</c>`);
    const total = combined.length;
    const root = oldXml.match(/<sst\b[^>]*>/)?.[0];
    if (!root) throw new Error('Excelの共有文字列を読み取れません。');
    // countは任意属性。既存の参照件数を誤って書き換えないよう省略する。
    const newRoot = root.replace(/\s(?:count|uniqueCount)="[^"]*"/g, '').replace(/\/?\s*>$/, ` uniqueCount="${total}">`);
    original.file('xl/sharedStrings.xml', `${oldXml.slice(0, oldXml.indexOf(root))}${newRoot}${combined.join('')}</sst>`);
    if (!originalStrings) {
      addRelationship('sharedStrings', 'sharedStrings.xml');
      addContentType('xl/sharedStrings.xml', 'sharedStrings');
    }
  }

  const sourceRelsPath = generatedSheetPath.replace(/\/([^/]+)$/, '/_rels/$1.rels');
  const sheetRels = generated.file(sourceRelsPath);
  if (sheetRels) {
    const relXml = await sheetRels.async('string');
    if (nodes(relXml, 'Relationship').some(node => attr(node, 'TargetMode') !== 'External')) {
      throw new Error('追加シートに未対応の関連ファイルがあります。元ファイルは変更していません。');
    }
    original.file(`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`, relXml);
  }
  if (templateXml) {
    const sourceTemplateRels=original.file(templatePath.replace(/\/([^/]+)$/, '/_rels/$1.rels'));
    let layoutXml=templateXml;
    if (sourceTemplateRels) {
      const targetRelsPath=sheetPath.replace(/\/([^/]+)$/, '/_rels/$1.rels');
      let targetRels=await original.file(targetRelsPath)?.async('string') || '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      let count=1;
      for (const relation of nodes(await sourceTemplateRels.async('string'),'Relationship')) {
        const oldId=attr(relation,'Id');let id='rIdTemplate'+count++;
        while(nodes(targetRels,'Relationship').some(node=>attr(node,'Id')===id)) id='rIdTemplate'+count++;
        targetRels=appendTo(targetRels,'Relationships',relation.replace(/\bId="[^"]*"/, 'Id="'+id+'"'));
        layoutXml=layoutXml.replace(new RegExp('r:id="'+oldId+'"','g'),'r:id="'+id+'"');
      }
      original.file(targetRelsPath,targetRels);
    }
    newSheetXml=restoreTemplateLayout(newSheetXml,layoutXml);
  }
  const newSheetIndex = nodes(workbook, 'sheet').length;
  if(templateIndex>=0) {
    const names=nodes(section(workbook,'definedNames'),'definedName').filter(node=>attr(node,'localSheetId')===String(templateIndex));
    const oldName=attr(originalSheetNodes[templateIndex],'name');
    const quotedOld="'"+oldName.replace(/'/g,"''")+"'!";
    const quotedNew="'"+escapeXml(sheetName).replace(/'/g,"''")+"'!";
    const copied=names.map(name=>name.replace(/localSheetId="[^"]*"/, 'localSheetId="'+newSheetIndex+'"').split(quotedOld).join(quotedNew).split(oldName+'!').join(quotedNew)).join('');
    if(copied) workbook=workbook.replace(section(workbook,'definedNames'),appendTo(section(workbook,'definedNames'),'definedNames',copied));
  }
  const sheetId = Math.max(0, ...nodes(workbook, 'sheet').map(node => Number(attr(node, 'sheetId')))) + 1;
  const relationId = addRelationship('worksheet', `worksheets/sheet${sheetNumber}.xml`);
  workbook = workbook.replace(section(workbook, 'sheets'), appendTo(section(workbook, 'sheets'), 'sheets', `<sheet name="${escapeXml(sheetName)}" sheetId="${sheetId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relationId}"/>`));
  // 既存シートの内容には触れず、Excelを開いたときに追加シートを表示する。
  const oldViews = section(workbook, 'bookViews');
  const newView = `<workbookView activeTab="${newSheetIndex}" firstSheet="0"/>`;
  if (!oldViews) workbook = workbook.replace(section(workbook, 'sheets'), `<bookViews>${newView}</bookViews>${section(workbook, 'sheets')}`);
  else {
    const views = nodes(oldViews, 'workbookView');
    let nextViews = oldViews;
    if (!views.length) nextViews = appendTo(oldViews, 'bookViews', newView);
    else for (const view of views) {
      const next = view.replace(/\s(?:activeTab|firstSheet)="[^"]*"/g, '').replace(/(\/?>)$/, ` activeTab="${newSheetIndex}" firstSheet="0"$1`);
      nextViews = nextViews.replace(view, next);
    }
    workbook = workbook.replace(oldViews, nextViews);
  }
  addContentType(sheetPath, 'worksheet');
  original.file(sheetPath, newSheetXml);
  original.file('xl/workbook.xml', workbook);
  original.file('xl/_rels/workbook.xml.rels', relationships);
  original.file('[Content_Types].xml', contentTypes);
  return original.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
}

/** 保存先から再読込したファイルで、新規追加と既存シートの不変を検証する。 */
export async function verifyAddedExcelSheet(originalBuffer: ArrayBuffer, savedBuffer: ArrayBuffer | Uint8Array, sheetName: string) {
  const [original, saved] = await Promise.all([JSZip.loadAsync(originalBuffer), JSZip.loadAsync(savedBuffer)]);
  const oldBook = await original.file('xl/workbook.xml')?.async('string');
  const newBook = await saved.file('xl/workbook.xml')?.async('string');
  const oldSheets = nodes(oldBook || '', 'sheet');
  const newSheets = nodes(newBook || '', 'sheet');
  if (!newBook || newSheets.length !== oldSheets.length + 1 || !newSheets.some(sheet => attr(sheet, 'name') === escapeXml(sheetName))) {
    throw new Error(`保存したファイルに新規シート「${sheetName}」を確認できませんでした。保存先のファイルを確認してください。`);
  }
  for (const path of Object.keys(original.files).filter(path => /^xl\/worksheets\/[^/]+\.xml$/.test(path))) {
    const before = await original.file(path)!.async('string');
    const after = await saved.file(path)?.async('string');
    if (before !== after) throw new Error('既存シートの保護を確認できませんでした。保存先のファイルを確認してください。');
  }
}

/** 一度限りの復旧用。数値日付と数式は保持し、文字列の日付は年なし表示に統一する。 */
export async function repairExcelDateFormats(source: ArrayBuffer, previewOnly = false): Promise<{
  buffer: Uint8Array | null; changedCells: number; sheetNames: string[];
}> {
  const zip = await JSZip.loadAsync(source);
  const read = async (path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error(`Excelの${path}が見つかりません。`);
    return file.async('string');
  };
  let styles = await read('xl/styles.xml');
  const workbook = await read('xl/workbook.xml');
  const relationships = nodes(await read('xl/_rels/workbook.xml.rels'), 'Relationship');
  const decodeXml = (value: string) => value.replace(/&(?:#x([\da-f]+)|#(\d+)|amp|lt|gt|quot|apos);/gi, (entity, hex, decimal) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : decimal ? String.fromCodePoint(Number(decimal))
      : ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"}[entity] ?? entity));
  const textContent = (xml: string) => nodes(xml, 't').map(node => decodeXml(node.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, ''))).join('');
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile ? nodes(await sharedStringsFile.async('string'), 'si').map(textContent) : [];
  const date1904 = /\bdate1904="(?:1|true)"/.test(workbook);
  const serialToText = (value: number) => {
    const date = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + Math.floor(value) * 86400000);
    return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  };
  const formats = nodes(section(styles, 'numFmts'), 'numFmt');
  const formatCodes = new Map(formats.map(node => [Number(attr(node, 'numFmtId')), attr(node, 'formatCode')]));
  const desiredFormat = 'm&quot;月&quot;d&quot;日&quot;';
  let dateFormatId = [...formatCodes].find(([, code]) => code === desiredFormat)?.[0];
  if (dateFormatId === undefined) {
    dateFormatId = Math.max(163, ...formatCodes.keys()) + 1;
    formats.push(`<numFmt numFmtId="${dateFormatId}" formatCode="${desiredFormat}"/>`);
  }
  const xfs = nodes(section(styles, 'cellXfs'), 'xf');
  const originalStyleCount = xfs.length;
  if (!originalStyleCount) throw new Error('Excelのセル書式を読み取れません。');
  const repairedStyles = new Map<number, number>();
  const fonts = nodes(section(styles, 'fonts'), 'font');
  const resizeDateCell = (cell: string) => {
    const oldIndex = Number(attr(cell, 's') || 0);
    const oldStyle = xfs[oldIndex];
    if (!oldStyle) throw new Error('日付欄のセル書式を読み取れません。');
    const oldFont = fonts[Number(attr(oldStyle, 'fontId') || 0)];
    if (!oldFont) throw new Error('日付欄のフォントを読み取れません。');
    if (Number(attr(oldStyle, 'numFmtId')) === dateFormatId && Number(attr(section(oldFont, 'sz'), 'val')) === 12) return cell;
    let newIndex = repairedStyles.get(oldIndex);
    if (newIndex === undefined) {
      const font = section(oldFont, 'sz') ? oldFont.replace(section(oldFont, 'sz'), '<sz val="12"/>') : appendTo(oldFont, 'font', '<sz val="12"/>');
      let fontId = fonts.indexOf(font);
      if (fontId < 0) { fontId = fonts.length; fonts.push(font); }
      const newStyle = oldStyle.replace(/^<xf\b[^>]*?\/?>/, opening => {
        let updated = opening;
        for (const [key, value] of Object.entries({numFmtId: dateFormatId, fontId, applyNumberFormat: 1, applyFont: 1})) {
          const pattern = new RegExp(`\\b${key}="[^"]*"`);
          updated = pattern.test(updated) ? updated.replace(pattern, `${key}="${value}"`) : updated.replace('<xf', `<xf ${key}="${value}"`);
        }
        return updated;
      });
      newIndex = xfs.length;
      xfs.push(newStyle);
      repairedStyles.set(oldIndex, newIndex);
    }
    return cell.replace(/^<c\b[^>]*>/, opening => /\bs="/.test(opening)
      ? opening.replace(/\bs="\d+"/, `s="${newIndex}"`) : opening.replace('<c', `<c s="${newIndex}"`));
  };
  // 結合セルの位置が異なる旧シートも含め、日付列の6ブロック全体を対象にする。
  const dateAddresses = new Set(Array.from({length: 30}, (_, index) => `A${12 + index}`));
  let changedCells = 0;
  const sheetNames: string[] = [];
  for (const sheet of nodes(workbook, 'sheet')) {
    const name = attr(sheet, 'name');
    const normalized = name.normalize('NFKC').replace(/[\s　]/g, '');
    if (!/^(?:20\d{2}[年/.-]?(?:0?[1-9]|1[0-2])月?|(?:0?[1-9]|1[0-2])月)(?:\([A-Z]\)|_\d+)?$/.test(normalized)) continue;
    const relation = relationships.find(node => attr(node, 'Id') === attr(sheet, 'r:id'));
    if (!relation) throw new Error(`「${name}」のシート情報を読み取れません。`);
    const target = attr(relation, 'Target');
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = await read(path);
    let sheetChanges = 0;
    const repaired = xml.replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, cell => {
      if (!dateAddresses.has(attr(cell, 'r'))) return cell;
      const type = attr(cell, 't');
      const rawValue = cell.match(/<v>([^<]+)<\/v>/)?.[1];
      const isFormula = /<f\b/.test(cell);
      if (type && type !== 'n') {
        if (isFormula) return cell;
        const text = (type === 's' ? sharedStrings[Number(rawValue)] || '' : type === 'inlineStr' ? textContent(cell) : decodeXml(rawValue || '')).normalize('NFKC').trim();
        let display = '';
        if (/^\d+(?:\.\d+)?$/.test(text) && Number(text) >= 20000 && Number(text) <= 100000) {
          display = serialToText(Number(text));
        } else {
          const date = text.match(/^(?:(\d{4})[年/.-]|令和(\d+)年|平成(\d+)年)?\s*(\d{1,2})[月/.-]\s*(\d{1,2})日?(?:\s.*)?$/);
          if (date) {
            const month = Number(date[4]), day = Number(date[5]);
            const year = date[1] ? Number(date[1]) : date[2] ? 2018 + Number(date[2]) : date[3] ? 1988 + Number(date[3]) : 2000;
            const check = new Date(Date.UTC(year, month - 1, day));
            if (check.getUTCFullYear() === year && check.getUTCMonth() + 1 === month && check.getUTCDate() === day) display = `${month}月${day}日`;
          }
        }
        if (!display) return cell;
        const styledCell = resizeDateCell(cell);
        if (display === text && styledCell === cell) return cell;
        sheetChanges++;
        if (display === text) return styledCell;
        // 文字列だった日付は、このセルだけ年なしの文字列に置換する。共有文字列は書き換えない。
        return styledCell.replace(/^<c\b([^>]*)>[\s\S]*<\/c>$/, (_node, attributes: string) =>
          `<c${attributes.replace(/\s+t="[^"]*"/, '')} t="inlineStr"><is><t>${escapeXml(display)}</t></is></c>`);
      }
      const value = rawValue;
      if (!value || !Number.isFinite(Number(value)) || Number(value) < 20000 || Number(value) > 100000) return cell;
      const styledCell = resizeDateCell(cell);
      if (styledCell === cell) return cell;
      sheetChanges++;
      return styledCell;
    });
    if (sheetChanges) {
      zip.file(path, repaired);
      changedCells += sheetChanges;
      sheetNames.push(name);
    }
  }
  if (!changedCells || previewOnly) return {buffer: null, changedCells, sheetNames};
  styles = setStyleSection(styles, 'numFmts', formats);
  styles = setStyleSection(styles, 'fonts', fonts);
  styles = setStyleSection(styles, 'cellXfs', xfs);
  zip.file('xl/styles.xml', styles);
  return {buffer: await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'}), changedCells, sheetNames};
}
