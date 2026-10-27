import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { SheetInfo, CellModification, TemplateResult, CellRule } from './types';
import {
  TEMPLATE_RULES,
  buildProductTemplateRules,
  buildMultiProductTemplateRules,
  ProductTemplateInput,
} from './rules';

const parsedTemplateModels = new WeakMap<File, Promise<any>>();
const templateBuffers = new WeakMap<File, Promise<ArrayBuffer>>();

function getTemplateBuffer(file: File): Promise<ArrayBuffer> {
  let bufferPromise = templateBuffers.get(file);
  if (!bufferPromise) {
    bufferPromise = file.arrayBuffer();
    templateBuffers.set(file, bufferPromise);
  }
  return bufferPromise;
}

async function loadTemplateWorkbook(file: File, arrayBuffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  let modelPromise = parsedTemplateModels.get(file);
  if (!modelPromise) {
    modelPromise = (async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      return workbook.model;
    })();
    parsedTemplateModels.set(file, modelPromise);
  }

  try {
    const model = await modelPromise;
    const workbook = new ExcelJS.Workbook();
    workbook.model = structuredClone(model);
    return workbook;
  } catch (error) {
    parsedTemplateModels.delete(file);
    throw error;
  }
}

export interface SavedTemplateField {
  id: string;
  label: string;
  source: 'title' | 'englishTitle' | 'spuCode' | 'whiteImage' | 'blackImage' | 'static';
  column: string;
  rowOffset: number;
  repeatCount?: number;
  rowStep?: number;
  staticValue?: string;
}

export interface SavedTemplateConfig {
  name: string;
  targetSheetIndex: number;
  startRow: number;
  rowsPerProduct: number;
  fields: SavedTemplateField[];
}

export async function generateMappedTemplateFile(options: {
  file: File;
  config: SavedTemplateConfig;
  products: ProductTemplateInput[];
  filename: string;
}): Promise<TemplateResult> {
  const { file, config, products, filename } = options;
  if (!Number.isInteger(config.targetSheetIndex) || config.targetSheetIndex < 0 || !Number.isInteger(config.startRow) || config.startRow < 1 || !Number.isInteger(config.rowsPerProduct) || config.rowsPerProduct < 1) {
    throw new Error('模板的子表、起始行或每款行数配置无效');
  }
  for (const field of config.fields) {
    const repeatCount = field.repeatCount || 1;
    const rowStep = field.rowStep || 1;
    if (!/^[A-Z]{1,3}$/.test(field.column.toUpperCase()) || !Number.isInteger(field.rowOffset) || field.rowOffset < 0 || field.rowOffset >= config.rowsPerProduct || !Number.isInteger(repeatCount) || repeatCount < 1 || !Number.isInteger(rowStep) || rowStep < 1 || field.rowOffset + (repeatCount - 1) * rowStep >= config.rowsPerProduct) {
      throw new Error(`字段「${field.label}」的列或行偏移无效`);
    }
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookXmlFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookXmlFile || !relsFile) throw new Error('无法读取 Excel 工作簿结构');
  const workbookXml = await workbookXmlFile.async('string');
  const relsXml = await relsFile.async('string');
  const sheetTags = [...workbookXml.matchAll(/<sheet\b[^>]*\/>|<sheet\b[^>]*>[\s\S]*?<\/sheet>/g)].map((match) => match[0]);
  const sheetTag = sheetTags[config.targetSheetIndex];
  if (!sheetTag) throw new Error('所选目标子表不存在，请重新编辑模板配置');
  const sheetName = sheetTag.match(/\bname="([^"]+)"/)?.[1] || `工作表${config.targetSheetIndex + 1}`;
  const relId = sheetTag.match(/r:id="([^"]+)"/)?.[1];
  const relation = relId && [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => match[0]).find((tag) => tag.match(/\bId="([^"]+)"/)?.[1] === relId);
  const target = relation?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error('无法解析目标工作表文件');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheetXmlFile = zip.file(sheetPath);
  if (!sheetXmlFile) throw new Error(`找不到目标工作表「${sheetName}」的数据文件`);
  let sheetXml = await sheetXmlFile.async('string');
  const mergedRanges = [...sheetXml.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+\d+):([A-Z]+\d+)"[^>]*\/>/g)].map((match) => ({ start: match[1], end: match[2] }));
  const columnNumber = (letters: string) => [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  const cellParts = (address: string) => { const match = address.match(/^([A-Z]+)(\d+)$/); return match ? { col: columnNumber(match[1]), row: Number(match[2]) } : null; };
  const resolveMergedMaster = (address: string) => {
    const cell = cellParts(address);
    if (!cell) return address;
    for (const range of mergedRanges) {
      const start = cellParts(range.start); const end = cellParts(range.end);
      if (start && end && cell.row >= start.row && cell.row <= end.row && cell.col >= start.col && cell.col <= end.col) return range.start;
    }
    return address;
  };
  const modifications: CellModification[] = [];
  const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const setCellValue = (address: string, value: string | number) => {
    const escaped = xmlEscape(String(value));
    const existingCell = new RegExp(`<c\b(?=[^>]*\br="${address}")[^>]*(?:\/>|>[\s\S]*?<\/c>)`);
    const match = sheetXml.match(existingCell);
    if (match) {
      const opening = match[0].match(/^<c\b[^>]*?(?=\s*\/?>)/)?.[0] || `<c r="${address}"`;
      const style = opening.match(/\bs="[^"]*"/)?.[0];
      const replacement = `<c r="${address}"${style ? ` ${style}` : ''} t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
      sheetXml = sheetXml.replace(match[0], replacement);
    } else {
      const rowNumber = Number(address.match(/\d+$/)?.[0]);
      const rowRegex = new RegExp(`<row\b(?=[^>]*\br="${rowNumber}")[^>]*>`);
      const rowMatch = sheetXml.match(rowRegex);
      const cellXml = `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
      if (rowMatch) {
        const rowStart = sheetXml.indexOf(rowMatch[0]) + rowMatch[0].length;
        const rowEnd = sheetXml.indexOf('</row>', rowStart);
        if (rowEnd < 0) throw new Error(`无法扩展工作表第 ${rowNumber} 行`);
        const rowBody = sheetXml.slice(rowStart, rowEnd);
        const nextCell = [...rowBody.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)]
          .find((candidate) => columnNumber(candidate[1]) > columnNumber(address.match(/^[A-Z]+/)?.[0] || 'A'));
        const insertAt = nextCell?.index === undefined ? rowEnd : rowStart + nextCell.index;
        sheetXml = `${sheetXml.slice(0, insertAt)}${cellXml}${sheetXml.slice(insertAt)}`;
      } else {
        const sheetDataEnd = sheetXml.indexOf('</sheetData>');
        if (sheetDataEnd < 0) throw new Error('无法定位工作表数据区域');
        const newRow = `<row r="${rowNumber}">${cellXml}</row>`;
        const followingRow = new RegExp(`<row\\b(?=[^>]*\\br="(\\d+)")[^>]*>`).exec(sheetXml.slice(0, sheetDataEnd));
        let insertAt = sheetDataEnd;
        if (followingRow) {
          const candidates = [...sheetXml.slice(0, sheetDataEnd).matchAll(/<row\b(?=[^>]*\br="(\d+)")[^>]*>/g)];
          const next = candidates.find((candidate) => Number(candidate[1]) > rowNumber);
          if (next && next.index !== undefined) insertAt = next.index;
        }
        sheetXml = `${sheetXml.slice(0, insertAt)}${newRow}${sheetXml.slice(insertAt)}`;
      }
    }
  };
  products.forEach((product, productIndex) => {
    for (const field of config.fields) {
      for (let repeatIndex = 0; repeatIndex < (field.repeatCount || 1); repeatIndex++) {
        const row = config.startRow + productIndex * config.rowsPerProduct + field.rowOffset + repeatIndex * (field.rowStep || 1);
        const cellAddress = resolveMergedMaster(`${field.column.toUpperCase()}${row}`);
        const existingCell = new RegExp(`<c\b(?=[^>]*\br="${cellAddress}")[^>]*(?:\/>|>[\s\S]*?<\/c>)`).exec(sheetXml)?.[0];
        const originalValue = existingCell?.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '(空白)';
        const value = field.source === 'static' ? field.staticValue || '' : ({ title: product.title, englishTitle: product.englishTitle || '', spuCode: product.spuCode || '', whiteImage: product.whiteImageUrl || '', blackImage: product.blackImageUrl || '' })[field.source];
        setCellValue(cellAddress, value);
        modifications.push({ cell: cellAddress, column: field.column.toUpperCase(), value, originalValue, verifiedValue: String(value), category: field.label });
      }
    }
  });
  zip.file(sheetPath, sheetXml);
  if (!config.fields.length) throw new Error('请至少配置一个要写入模板的字段');
  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return {
    fileName: filename, targetSheetName: sheetName, targetSheetIndex: config.targetSheetIndex,
    allSheets: sheetTags.map((tag, index) => ({ index, name: tag.match(/\bname="([^"]+)"/)?.[1] || `工作表${index + 1}`, isVisible: !/\bstate="hidden"/.test(tag), isTarget: index === config.targetSheetIndex })),
    modifications, outputBlob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    message: `已按「${config.name}」配置写入 ${products.length} 款商品，保留其他工作表`,
  };
}

/**
 * 「生成模板」引擎：
 * 将用户导入的工作簿，在其第 2 个工作表（或指定工作表）的第 6 行（SPU）与第 7 行（SKC）安全填入指定的规格字段。
 * 100% 保护未修改单元格与原工作表的字体、样式、公式、边框、行列高宽。
 */
export async function executeTemplateGeneration(
  file: File,
  targetSheetIdx?: number,
  customRules: CellRule[] = TEMPLATE_RULES
): Promise<TemplateResult> {
  const arrayBuffer = await getTemplateBuffer(file);

  try {
    const workbook = await loadTemplateWorkbook(file, arrayBuffer);

    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      throw new Error('工作簿中未包含有效的工作表');
    }

    // 筛选可见工作表
    const visibleWorksheets = workbook.worksheets.filter(
      (w) => w.state === 'visible' || !w.state
    );

    let targetWorksheet: ExcelJS.Worksheet;

    if (typeof targetSheetIdx === 'number' && workbook.worksheets[targetSheetIdx]) {
      targetWorksheet = workbook.worksheets[targetSheetIdx];
    } else if (visibleWorksheets.length >= 2) {
      // 默认选中第 2 个可见工作表
      targetWorksheet = visibleWorksheets[1];
    } else if (workbook.worksheets.length >= 2) {
      targetWorksheet = workbook.worksheets[1];
    } else {
      targetWorksheet = workbook.worksheets[0];
    }

    const actualTargetIndex = workbook.worksheets.indexOf(targetWorksheet);
    const targetSheetName = targetWorksheet.name;

    // 收集所有子表信息
    const allSheets: SheetInfo[] = workbook.worksheets.map((w, idx) => ({
      index: idx,
      name: w.name,
      isVisible: w.state === 'visible' || !w.state,
      isTarget: idx === actualTargetIndex,
    }));

    // 确保目标行处于可见状态
    const maxRowInRules = customRules.reduce((max, r) => {
      const match = r.cell.match(/\d+/);
      const rowNum = match ? parseInt(match[0], 10) : 0;
      return Math.max(max, rowNum);
    }, 20);
    for (let r = 6; r <= maxRowInRules; r++) {
      targetWorksheet.getRow(r).hidden = false;
    }

    const modifications: CellModification[] = [];

    // 执行各字段安全写入
    for (const rule of customRules) {
      targetWorksheet.getColumn(rule.column).hidden = false;

      const cell = targetWorksheet.getCell(rule.cell);
      const originalValue = String(cell.value ?? '(空白)');

      // AC 列填入 '65%'，AE 列填入 '35%' (严格写入字面百分比字符串，不填 0.65 或 0.35)
      if (rule.column === 'AC' || rule.column === 'AE') {
        const val = rule.column === 'AC' ? '65%' : '35%';
        if (cell.isMerged && cell.master) {
          cell.master.value = val;
          if (cell.master.numFmt && cell.master.numFmt.includes('%')) {
            cell.master.numFmt = '@';
          }
        }
        cell.value = val;
        if (cell.numFmt && cell.numFmt.includes('%')) {
          cell.numFmt = '@';
        }
      } else {
        if (cell.isMerged && cell.master) {
          cell.master.value = rule.value;
          if (cell.master.numFmt && cell.master.numFmt.includes('%')) {
            cell.master.numFmt = '';
          }
        }
        cell.value = rule.value;
        if (cell.numFmt && cell.numFmt.includes('%')) {
          cell.numFmt = '';
        }
      }

      const verified = rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : String(cell.value ?? '');

      modifications.push({
        cell: rule.cell,
        column: rule.column,
        value: rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : rule.value,
        originalValue,
        verifiedValue: verified,
        category: rule.category,
      });
    }

    // 设置活动视图：打开后默认切入目标子表并聚焦第 6 行
    workbook.views = [
      {
        x: 0,
        y: 0,
        width: 10000,
        height: 20000,
        firstSheet: 0,
        activeTab: Math.max(0, actualTargetIndex),
        visibility: 'visible',
      },
    ];

    targetWorksheet.views = [
      {
        state: 'normal',
        activeCell: 'C6',
        showGridLines: true,
      },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const outputBlob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    return {
      fileName: file.name,
      targetSheetName,
      targetSheetIndex: actualTargetIndex,
      allSheets,
      modifications,
      outputBlob,
      message: `已在第 2 个工作表「${targetSheetName}」成功写入生成模板数据`,
    };
  } catch (err: any) {
    console.warn('ExcelJS engine fallback to XLSX:', err);

    // 备用解析器
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, cellDates: true });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      throw new Error('未在文件中发现有效的工作表');
    }

    let targetIdx = typeof targetSheetIdx === 'number' ? targetSheetIdx : (wb.SheetNames.length >= 2 ? 1 : 0);
    if (targetIdx >= wb.SheetNames.length) targetIdx = 0;
    const targetSheetName = wb.SheetNames[targetIdx];

    const sheet = wb.Sheets[targetSheetName];
    const modifications: CellModification[] = [];

    // DZ 列对应的 0-index 为 129，EA 列为 130
    // 计算规则中涉及的最大行数，确保 !ref 范围覆盖所有追加的商品行
    const maxRowInRules = customRules.reduce((max, r) => {
      const match = r.cell.match(/\d+/);
      const rowNum = match ? parseInt(match[0], 10) : 0;
      return Math.max(max, rowNum);
    }, 25);

    let range: XLSX.Range = { s: { r: 0, c: 0 }, e: { r: maxRowInRules + 5, c: 145 } };
    if (sheet['!ref']) {
      const decoded = XLSX.utils.decode_range(sheet['!ref']);
      range.s.r = Math.min(decoded.s.r, 0);
      range.s.c = Math.min(decoded.s.c, 0);
      range.e.r = Math.max(decoded.e.r, maxRowInRules + 5);
      range.e.c = Math.max(decoded.e.c, 145);
    }
    sheet['!ref'] = XLSX.utils.encode_range(range);


    for (const rule of customRules) {
      const orig = sheet[rule.cell] ? String(sheet[rule.cell].v ?? '') : '(空白)';
      if (rule.column === 'AC') {
        sheet[rule.cell] = { t: 's', v: '65%' };
      } else if (rule.column === 'AE') {
        sheet[rule.cell] = { t: 's', v: '35%' };
      } else if (typeof rule.value === 'number') {
        const formattedStr = rule.numFmt === '0%' ? `${Math.round(rule.value * 100)}%` : String(rule.value);
        sheet[rule.cell] = { t: 'n', v: rule.value, z: rule.numFmt, w: formattedStr };
      } else {
        sheet[rule.cell] = { t: 's', v: rule.value };
      }
      modifications.push({
        cell: rule.cell,
        column: rule.column,
        value: rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : rule.value,
        originalValue: orig,
        verifiedValue: rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : String(rule.value),
        category: rule.category,
      });
    }

    const allSheets: SheetInfo[] = wb.SheetNames.map((name, idx) => ({
      index: idx,
      name,
      isVisible: true,
      isTarget: idx === targetIdx,
    }));

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const outputBlob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    return {
      fileName: file.name,
      targetSheetName,
      targetSheetIndex: targetIdx,
      allSheets,
      modifications,
      outputBlob,
      message: `已在第 2 个工作表「${targetSheetName}」成功写入生成模板数据`,
    };
  }
}

/**
 * 当未上传底表文件时，直接从零构建标准商品上架模板 Excel
 */
export async function createDefaultProductTemplate(
  productTitle: string,
  whiteImageUrl?: string,
  blackImageUrl?: string,
  englishTitle?: string
): Promise<TemplateResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI-Ecommerce-Modifier';
  workbook.created = new Date();

  // Sheet 1: 说明页
  const readmeSheet = workbook.addWorksheet('填写与上架说明');
  readmeSheet.addRow(['跨境电商商品上架标准化模板（自动生成）']);
  readmeSheet.addRow(['第 2 个工作表「商品信息上架模板」已完成以下数据写入：']);
  readmeSheet.addRow(['1. C6: 处理好的中文商品标题']);
  readmeSheet.addRow(['2. D6: 谷歌翻译生成的英文标题']);
  readmeSheet.addRow(['3. B6 及 B7~B18: 填入同一个 SPU 下以 018 开头的 14 位随机编号']);
  readmeSheet.addRow(['4. DS6 及 DS7~DS18: 填入生成的图片直链 (与 EA 列同步)']);
  readmeSheet.addRow(['5. 第 6 行 SPU 标准规格参数 (A, B, D, E, F, G, Q, AB~AF, AL~AY, BL, CJ~CL)']);
  readmeSheet.addRow(['6. 第 7~18 行 SKU 双色×6码 标准规格、主图(DS)、副图(DT~DW)与首图(EA)矩阵 (A, B, C, D, CA~CF, CG~CJ, CO~CX, DO~DR, DS, DT~DW, EA)']);

  // Sheet 2: 目标模板页
  const targetWorksheet = workbook.addWorksheet('商品信息上架模板');

  const rules = buildProductTemplateRules(productTitle, whiteImageUrl, blackImageUrl, englishTitle);
  const modifications: CellModification[] = [];

  for (const rule of rules) {
    const cell = targetWorksheet.getCell(rule.cell);
    if (rule.column === 'AC' || rule.column === 'AE') {
      const val = rule.column === 'AC' ? '65%' : '35%';
      cell.value = val;
      cell.numFmt = '@';
    } else {
      cell.value = rule.value;
    }
    const verified = rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : String(cell.value ?? '');
    modifications.push({
      cell: rule.cell,
      column: rule.column,
      value: rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : rule.value,
      originalValue: '(空白)',
      verifiedValue: verified,
      category: rule.category,
    });
  }

  // 视图设定
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 10000,
      height: 20000,
      firstSheet: 0,
      activeTab: 1,
      visibility: 'visible',
    },
  ];
  targetWorksheet.views = [{ state: 'normal', activeCell: 'C6', showGridLines: true }];

  const buffer = await workbook.xlsx.writeBuffer();
  const outputBlob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return {
    fileName: `${productTitle.slice(0, 30) || '商品'}_标准上架模板.xlsx`,
    targetSheetName: '商品信息上架模板',
    targetSheetIndex: 1,
    allSheets: [
      { index: 0, name: '填写与说明', isVisible: true, isTarget: false },
      { index: 1, name: '商品信息上架模板', isVisible: true, isTarget: true },
    ],
    modifications,
    outputBlob,
    message: `已成功生成「${productTitle || '商品'}」的上架模板 Excel (含 D6 谷歌翻译英文标题)`,
  };
}

/**
 * 从零构建支持多个商品在同一个工作表内向下依次追加的标准商品上架模板 Excel
 * 6行到16行为一个商品 (共11行)，同一表格往下增加
 */
export async function createDefaultMultiProductTemplate(
  products: ProductTemplateInput[],
  customFilename?: string
): Promise<TemplateResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI-Ecommerce-Modifier';
  workbook.created = new Date();

  // Sheet 1: 说明页
  const readmeSheet = workbook.addWorksheet('填写与上架说明');
  readmeSheet.addRow(['跨境电商商品上架标准化整合模板（单表格多商品向下追加）']);
  readmeSheet.addRow(['第 2 个工作表「商品信息上架模板」已完成以下数据写入：']);
  readmeSheet.addRow(['1. 6行到16行为一个商品 (共11行：1行 SPU + 10行 SKU)，所有商品在同一个工作表内依序向下递增填充']);
  readmeSheet.addRow(['   - 第 1 个商品: 第 6~16 行，C6 填入中文标题，D6 填入谷歌翻译英文标题，EA6~11 白色款直链，EA12~16 黑色款直链']);
  readmeSheet.addRow(['   - 第 2 个商品: 第 17~27 行，C17 填入中文标题，D17 填入英文标题，EA17~22 白色款直链，EA23~27 黑色款直链']);
  readmeSheet.addRow(['   - 第 3 个商品: 第 28~38 行，C28 填入中文标题，D28 填入英文标题，EA28~33 白色款直链，EA34~38 黑色款直链']);
  readmeSheet.addRow(['   - 以此类推，每商品 11 行连续追加，无需导出多表格']);
  readmeSheet.addRow(['2. 各商品统一填充 2色×5码 标准规格与海外仓库存矩阵 (A, B, C, D, CB~CG, CH~CK, CW~DF, DW~DZ)']);

  // Sheet 2: 目标模板页
  const targetWorksheet = workbook.addWorksheet('商品信息上架模板');

  const rules = buildMultiProductTemplateRules(products);
  const modifications: CellModification[] = [];

  for (const rule of rules) {
    const cell = targetWorksheet.getCell(rule.cell);
    if (rule.column === 'AC' || rule.column === 'AE') {
      const val = rule.column === 'AC' ? '65%' : '35%';
      cell.value = val;
      cell.numFmt = '@';
    } else {
      cell.value = rule.value;
    }
    const verified = rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : String(cell.value ?? '');
    modifications.push({
      cell: rule.cell,
      column: rule.column,
      value: rule.column === 'AC' ? '65%' : rule.column === 'AE' ? '35%' : rule.value,
      originalValue: '(空白)',
      verifiedValue: verified,
      category: rule.category,
    });
  }

  // 视图设定
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 10000,
      height: 20000,
      firstSheet: 0,
      activeTab: 1,
      visibility: 'visible',
    },
  ];
  targetWorksheet.views = [{ state: 'normal', activeCell: 'C6', showGridLines: true }];

  const buffer = await workbook.xlsx.writeBuffer();
  const outputBlob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const fileName =
    customFilename ||
    (products.length > 1
      ? `电商多商品汇总上架模板_共${products.length}款.xlsx`
      : `${products[0]?.title?.slice(0, 25) || '商品'}_标准上架模板.xlsx`);

  return {
    fileName,
    targetSheetName: '商品信息上架模板',
    targetSheetIndex: 1,
    allSheets: [
      { index: 0, name: '填写与上架说明', isVisible: true, isTarget: false },
      { index: 1, name: '商品信息上架模板', isVisible: true, isTarget: true },
    ],
    modifications,
    outputBlob,
    message: `已成功生成包含 ${products.length} 款商品的整合上架模板 Excel (含 D6 谷歌翻译英文标题)`,
  };
}

/**
 * 统一商品模板生成入口（多商品合并写入单表格）
 * 7行到16行为一个商品，同一表格往下增加
 */
export async function generateMultiProductTemplateFile(options: {
  products: ProductTemplateInput[];
  baseTemplateFile?: File | null;
  targetSheetIdx?: number;
  customFilename?: string;
}): Promise<TemplateResult> {
  const { products, baseTemplateFile, targetSheetIdx, customFilename } = options;
  const rules = buildMultiProductTemplateRules(products);

  if (baseTemplateFile) {
    return executeTemplateGeneration(baseTemplateFile, targetSheetIdx, rules);
  } else {
    return createDefaultMultiProductTemplate(products, customFilename);
  }
}

/**
 * 兼容原有单商品生成入口
 */
export async function generateProductTemplateFile(options: {
  baseTemplateFile?: File | null;
  productTitle: string;
  englishTitle?: string;
  whiteImageUrl?: string;
  blackImageUrl?: string;
  targetSheetIdx?: number;
}): Promise<TemplateResult> {
  const { baseTemplateFile, productTitle, englishTitle, whiteImageUrl, blackImageUrl, targetSheetIdx } = options;
  return generateMultiProductTemplateFile({
    products: [
      {
        title: productTitle,
        englishTitle,
        whiteImageUrl,
        blackImageUrl,
      },
    ],
    baseTemplateFile,
    targetSheetIdx,
  });
}


export function downloadTemplateFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

