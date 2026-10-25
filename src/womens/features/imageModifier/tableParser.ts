import * as XLSX from 'xlsx';
import { cleanChineseTitle } from '../../utils/titleCleaner';

export interface TableColumnOption {
  index: number;
  letter: string;
  name: string;
  sample: string;
}

export interface TableProductItem {
  id: string;
  rowIndex: number;
  title: string;
  imageUrl: string;
  isValidUrl: boolean;
  rawRow: Record<string, any>;
}

export interface TableParseResult {
  fileName: string;
  sheetNames: string[];
  activeSheetIndex: number;
  activeSheetName: string;
  columns: TableColumnOption[];
  detectedTitleColIndex: number;
  detectedImageColIndex: number;
  items: TableProductItem[];
  totalRows: number;
}

/**
 * 0-indexed column number to Excel column letter (0 -> A, 1 -> B, ..., 26 -> AA)
 */
export function colIndexToLetter(colIdx: number): string {
  let letter = '';
  let temp = colIdx + 1;
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter || 'A';
}

/**
 * 智能匹配商品标题关键词
 */
const TITLE_KEYWORDS = [
  '商品标题',
  '标题',
  '商品名称',
  '名称',
  '品名',
  '款名',
  'title',
  'product_title',
  'product_name',
  'name',
  'item_name',
  'spu名称',
  'spu',
];

/**
 * 智能匹配商品图片URL关键词
 */
const IMAGE_URL_KEYWORDS = [
  '商品图片',
  '图片url',
  '图片链接',
  '图片',
  '主图',
  '商品主图',
  '白底图',
  '缩略图',
  'image_url',
  'image',
  'img_url',
  'img',
  'url',
  'pic',
  'photo',
  'picture',
];

function isHttpUrl(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('data:image/')
  );
}

/**
 * 解析并识别用户导入的 Excel / CSV 表格中的商品标题与图片 URL
 */
export async function parseProductTable(
  file: File,
  targetSheetIndex: number = 0,
  manualTitleColIdx?: number,
  manualImageColIdx?: number
): Promise<TableParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('未在文件中发现有效的工作表');
  }

  const activeIdx = Math.min(Math.max(0, targetSheetIndex), workbook.SheetNames.length - 1);
  const activeSheetName = workbook.SheetNames[activeIdx];
  const worksheet = workbook.Sheets[activeSheetName];

  // 读取为 2D 数组
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawMatrix.length === 0) {
    throw new Error('选中的工作表内容为空');
  }

  // 找到第一个非空行作为表头（默认第 0 行）
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
    const row = rawMatrix[i];
    if (row && row.some((c: any) => String(c || '').trim() !== '')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rawMatrix[headerRowIdx] || [];
  const maxCols = Math.max(...rawMatrix.map((r) => (Array.isArray(r) ? r.length : 0)), headers.length);

  // 构建列信息选项
  const columns: TableColumnOption[] = [];
  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    const rawHeader = headers[colIdx];
    const headerName = rawHeader !== undefined && rawHeader !== null && String(rawHeader).trim() !== ''
      ? String(rawHeader).trim()
      : `未命名列 ${colIndexToLetter(colIdx)}`;

    // 提取样本值（前 3 个非空非表头行的值）
    let sample = '';
    for (let r = headerRowIdx + 1; r < Math.min(rawMatrix.length, headerRowIdx + 10); r++) {
      const val = rawMatrix[r]?.[colIdx];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        sample = String(val).trim();
        break;
      }
    }

    columns.push({
      index: colIdx,
      letter: colIndexToLetter(colIdx),
      name: headerName,
      sample: sample ? (sample.length > 40 ? sample.slice(0, 40) + '...' : sample) : '(空)',
    });
  }

  // 1. 自动检测「商品标题」列
  let titleColIdx = typeof manualTitleColIdx === 'number' ? manualTitleColIdx : -1;
  if (titleColIdx < 0 || titleColIdx >= maxCols) {
    // 优先根据表头名称匹配
    for (let i = 0; i < columns.length; i++) {
      const colNameLower = columns[i].name.toLowerCase();
      if (TITLE_KEYWORDS.some((kw) => colNameLower.includes(kw.toLowerCase()))) {
        titleColIdx = i;
        break;
      }
    }
    // 备用：若未匹配，且第 0 列或第 1 列不是 URL，选用第 0 列
    if (titleColIdx === -1 && columns.length > 0) {
      titleColIdx = 0;
    }
  }

  // 2. 自动检测「商品图片URL」列
  let imageColIdx = typeof manualImageColIdx === 'number' ? manualImageColIdx : -1;
  if (imageColIdx < 0 || imageColIdx >= maxCols) {
    // 优先根据表头名称匹配
    for (let i = 0; i < columns.length; i++) {
      const colNameLower = columns[i].name.toLowerCase();
      if (IMAGE_URL_KEYWORDS.some((kw) => colNameLower.includes(kw.toLowerCase()))) {
        imageColIdx = i;
        break;
      }
    }

    // 其次根据样本内容是否为 http/https URL 匹配
    if (imageColIdx === -1) {
      for (let i = 0; i < columns.length; i++) {
        // 检查该列多行数据
        let urlHitCount = 0;
        for (let r = headerRowIdx + 1; r < Math.min(rawMatrix.length, headerRowIdx + 20); r++) {
          const val = String(rawMatrix[r]?.[i] || '').trim();
          if (isHttpUrl(val)) {
            urlHitCount++;
          }
        }
        if (urlHitCount >= 1) {
          imageColIdx = i;
          break;
        }
      }
    }

    // 默认 fallback
    if (imageColIdx === -1) {
      imageColIdx = columns.length > 1 ? (titleColIdx === 0 ? 1 : 0) : 0;
    }
  }

  // 3. 提取所有商品项
  const items: TableProductItem[] = [];
  const dataRows = rawMatrix.slice(headerRowIdx + 1);

  dataRows.forEach((row, idx) => {
    const rawTitle = String(row[titleColIdx] ?? '').trim();
    let rawImageUrl = String(row[imageColIdx] ?? '').trim();

    // 兼容协议相对 URL //img.xxx -> https://img.xxx
    if (rawImageUrl.startsWith('//')) {
      rawImageUrl = `https:${rawImageUrl}`;
    }

    // 过滤完全空白的行
    if (!rawTitle && !rawImageUrl) {
      return;
    }

    const cleanedTitle = cleanChineseTitle(rawTitle);
    const title = cleanedTitle || `未命名商品_${idx + 1}`;
    const isValid = isHttpUrl(rawImageUrl);

    const rowObj: Record<string, any> = {};
    columns.forEach((col) => {
      rowObj[col.name] = row[col.index] ?? '';
    });

    items.push({
      id: `table_item_${idx + 1}_${Math.random().toString(36).substring(2, 7)}`,
      rowIndex: headerRowIdx + 2 + idx, // Excel 1-based row number
      title,
      imageUrl: rawImageUrl,
      isValidUrl: isValid,
      rawRow: rowObj,
    });
  });

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    activeSheetIndex: activeIdx,
    activeSheetName,
    columns,
    detectedTitleColIndex: titleColIdx,
    detectedImageColIndex: imageColIdx,
    items,
    totalRows: items.length,
  };
}

export interface ExportDualProductRow {
  title: string;
  originalUrl: string;
  whiteOutputUrl?: string;
  whiteStatus: string;
  blackOutputUrl?: string;
  blackStatus: string;
}

/**
 * 导出已完成双套提示词（白色款 & 黑色款）处理的表格
 */
export function exportProcessedProductsExcel(
  items: ExportDualProductRow[],
  fileName: string = '商品双色图片修改结果.xlsx'
) {
  const exportData = items.map((item, idx) => ({
    序号: idx + 1,
    商品标题: item.title,
    原图URL: item.originalUrl,
    '白色款图片URL (Prompt1)': item.whiteOutputUrl || '',
    '黑色款图片URL (Prompt2)': item.blackOutputUrl || '',
    白色款状态: item.whiteStatus,
    黑色款状态: item.blackStatus,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '双色修改结果');

  // 列宽优化
  worksheet['!cols'] = [
    { wch: 8 },  // 序号
    { wch: 35 }, // 商品标题
    { wch: 45 }, // 原图URL
    { wch: 45 }, // 白色款图片URL
    { wch: 45 }, // 黑色款图片URL
    { wch: 14 }, // 白色状态
    { wch: 14 }, // 黑色状态
  ];

  XLSX.writeFile(workbook, fileName);
}
