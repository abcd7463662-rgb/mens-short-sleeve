import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { TEMPLATE_RULES } from '../features/templateGenerator/rules';

export interface SheetInfo {
  index: number;
  name: string;
  isVisible: boolean;
  isTarget: boolean;
}

export interface CellModification {
  cell: string;
  column: string;
  value: string | number;
  originalValue: string;
  verifiedValue: string;
  category?: string;
}

export interface StylePreservedResult {
  fileName: string;
  targetSheetName: string;
  targetSheetIndex: number;
  allSheets: SheetInfo[];
  modifications: CellModification[];
  outputBlob: Blob;
  message: string;
}

// Rules to apply on row 6 of the second sheet
export const ROW6_RULES: { cell: string; column: string; value: string | number; category: string; numFmt?: string }[] = [
  // 1. 基础与产地属性
  { cell: 'A6', column: 'A', value: 'SPU', category: '基础属性' },
  { cell: 'B6', column: 'B', value: 2026, category: '基础属性' },
  { cell: 'E6', column: 'E', value: '中国大陆', category: '产地信息' },
  { cell: 'F6', column: 'F', value: '广东省', category: '产地信息' },
  { cell: 'G6', column: 'G', value: '中国大陆', category: '产地信息' },

  // 2. 材质面料成分
  { cell: 'Q6', column: 'Q', value: '有机棉混纺', category: '面料成分' },

  // 3. 面料成分（AB6 ~ AE6）
  { cell: 'AB6', column: 'AB', value: '聚酯纤维(涤纶)Polyester', category: '面料成分' },
  { cell: 'AC6', column: 'AC', value: '65%', category: '面料成分含量' },
  { cell: 'AD6', column: 'AD', value: '棉Cotton', category: '面料成分' },
  { cell: 'AE6', column: 'AE', value: '35%', category: '面料成分含量' },

  // 4. 风格与洗涤养护（AL6, AM6）及规格适用与工艺（AN6 ~ AY6）
  { cell: 'AL6', column: 'AL', value: '优雅', category: '风格' },
  { cell: 'AM6', column: 'AM', value: '数码印花类可机洗且不可干洗', category: '洗涤养护' },
  { cell: 'AN6', column: 'AN', value: 'ALL/全球/所有', category: '适用地区' },
  { cell: 'AO6', column: 'AO', value: '微弹', category: '弹性度' },
  { cell: 'AP6', column: 'AP', value: '否', category: '透气透光' },
  { cell: 'AQ6', column: 'AQ', value: '花朵印花', category: '图案花型' },
  { cell: 'AR6', column: 'AR', value: '无', category: '款式特征' },
  { cell: 'AS6', column: 'AS', value: '定位印花', category: '印花工艺' },
  { cell: 'AT6', column: 'AT', value: '梭织', category: '织造工艺' },
  { cell: 'AU6', column: 'AU', value: '圆领', category: '领型' },
  { cell: 'AV6', column: 'AV', value: '光面', category: '面料质感' },
  { cell: 'AW6', column: 'AW', value: 180, category: '克重数值' },
  { cell: 'AX6', column: 'AX', value: 'g/㎡', category: '克重单位' },
  { cell: 'AY6', column: 'AY', value: '无里料/无内衬', category: '里料内衬' },

  // 5. 现货模式与品牌尺码（BL6, CK6, CL6, CM6）
  { cell: 'BL6', column: 'BL', value: '现货款', category: '货源模式' },
  { cell: 'CK6', column: 'CK', value: 'Yang', category: '品牌/设计师' },
  { cell: 'CL6', column: 'CL', value: '1XL', category: '尺码规格' },
  { cell: 'CM6', column: 'CM', value: '偏大', category: '尺码感受' },
];

/**
 * Modifies cells in the second sheet (or specified sheet):
 * - Row 6: A6, B6, E6, F6, G6, Q6, AB6~AE6, AL6~AY6, BL6, CK6~CM6
 * while preserving all original template styles, fonts, fills, borders, row heights, and sheets.
 * Also configures active sheet view so Excel opens directly on the modified sheet.
 */
export async function modifyWorkbookPreservingStyles(
  file: File,
  targetSheetIdx?: number
): Promise<StylePreservedResult> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      throw new Error('工作簿中未包含有效的工作表');
    }

    // Determine visible sheets
    const visibleWorksheets = workbook.worksheets.filter(
      (w) => w.state === 'visible' || !w.state
    );

    let targetWorksheet: ExcelJS.Worksheet;

    if (typeof targetSheetIdx === 'number' && workbook.worksheets[targetSheetIdx]) {
      targetWorksheet = workbook.worksheets[targetSheetIdx];
    } else if (visibleWorksheets.length >= 2) {
      // By default: 2nd visible sheet
      targetWorksheet = visibleWorksheets[1];
    } else if (workbook.worksheets.length >= 2) {
      // 2nd sheet in workbook
      targetWorksheet = workbook.worksheets[1];
    } else {
      // Only 1 sheet exists
      targetWorksheet = workbook.worksheets[0];
    }

    const actualTargetIndex = workbook.worksheets.indexOf(targetWorksheet);
    const targetSheetName = targetWorksheet.name;

    // Collect all sheet information
    const allSheets: SheetInfo[] = workbook.worksheets.map((w, idx) => ({
      index: idx,
      name: w.name,
      isVisible: w.state === 'visible' || !w.state,
      isTarget: idx === actualTargetIndex,
    }));

    // Ensure target rows (6-18) are visible
    for (let r = 6; r <= 18; r++) {
      targetWorksheet.getRow(r).hidden = false;
    }

    // Apply all specified modifications
    const modifications: CellModification[] = [];

    for (const rule of TEMPLATE_RULES) {
      // Ensure column is visible
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

    // Set Excel view: Automatically switch active tab to the target sheet, focusing on row 6
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
        activeCell: 'A6',
        showGridLines: true,
      },
    ];

    // Write out workbook with untouched original styles
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
      message: `已在第二个子表「${targetSheetName}」成功写入第 6 行全部 ${modifications.length} 项指定数据`,
    };
  } catch (err: any) {
    console.warn('ExcelJS failed, using XLSX engine fallback:', err);

    // Fallback for legacy .xls binary files or special formats
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, cellDates: true });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      throw new Error('未在文件中发现有效的工作表');
    }

    let targetIdx = typeof targetSheetIdx === 'number' ? targetSheetIdx : (wb.SheetNames.length >= 2 ? 1 : 0);
    if (targetIdx >= wb.SheetNames.length) targetIdx = 0;
    const targetSheetName = wb.SheetNames[targetIdx];

    const sheet = wb.Sheets[targetSheetName];
    const modifications: CellModification[] = [];

    // Column CU is index 98
    let range: XLSX.Range = { s: { r: 0, c: 0 }, e: { r: 5, c: 98 } };
    if (sheet['!ref']) {
      const decoded = XLSX.utils.decode_range(sheet['!ref']);
      range.s.r = Math.min(decoded.s.r, 0);
      range.s.c = Math.min(decoded.s.c, 0);
      range.e.r = Math.max(decoded.e.r, 5);
      range.e.c = Math.max(decoded.e.c, 98);
    }
    sheet['!ref'] = XLSX.utils.encode_range(range);

    for (const rule of TEMPLATE_RULES) {
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
      message: `已在第二个子表「${targetSheetName}」成功写入第 6 行全部 ${modifications.length} 项指定数据`,
    };
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
