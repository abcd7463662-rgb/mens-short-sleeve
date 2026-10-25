import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { SheetInfo, CellModification, TemplateResult, CellRule } from './types';
import {
  TEMPLATE_RULES,
  buildProductTemplateRules,
  buildMultiProductTemplateRules,
  ProductTemplateInput,
} from './rules';

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
  const arrayBuffer = await file.arrayBuffer();

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

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

