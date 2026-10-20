import * as XLSX from 'xlsx';
import { cleanChineseTitle, cleanEnglishTitle } from '../../utils/titleCleaner';

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
  englishTitle?: string;
  imageUrl: string;
  whiteUrl?: string;
  blackUrl?: string;
  isValidUrl: boolean;
  rawRow: Record<string, any>;
}

export interface ColumnMappingOverrides {
  titleColIndex?: number;
  englishTitleColIndex?: number;
  imageColIndex?: number;
  whiteColIndex?: number;
  blackColIndex?: number;
  colorColIndex?: number;
}

export interface TableParseResult {
  fileName: string;
  sheetNames: string[];
  activeSheetIndex: number;
  activeSheetName: string;
  columns: TableColumnOption[];
  detectedTitleColIndex: number;
  detectedEnglishTitleColIndex: number;
  detectedImageColIndex: number;
  detectedWhiteColIndex: number;
  detectedBlackColIndex: number;
  detectedColorColIndex: number;
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

const ENGLISH_TITLE_KEYWORDS = [
  '英文标题',
  '英文名称',
  '英文',
  'english_title',
  'english title',
  'en_title',
  'en title',
  'english',
];

const WHITE_KEYWORDS = [
  '白色图片',
  '白图',
  '白色款',
  '白色',
  '白',
  'white_image',
  'white',
  '图1',
  '图片1',
  'image1',
  'img1',
];

const BLACK_KEYWORDS = [
  '黑色图片',
  '黑图',
  '黑色款',
  '黑色',
  '黑',
  'black_image',
  'black',
  '图2',
  '图片2',
  'image2',
  'img2',
];

const COLOR_KEYWORDS = [
  '颜色',
  '规格颜色',
  '款色',
  '色系',
  'color',
  'colour',
  'sku颜色',
];

const IMAGE_URL_KEYWORDS = [
  '图片链接',
  '图片url',
  '图片',
  '主图',
  '首图',
  '商品图片',
  '产品图片',
  '直链',
  'image',
  'img',
  'picture',
  'photo',
  'pic',
  'url',
  'ea',
];

export function isHttpUrl(str: any): boolean {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('//') ||
    s.startsWith('data:image/') ||
    /\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(s)
  );
}

function normalizeImageUrl(val: any): string {
  if (!val) return '';
  let s = String(val).trim();
  if (s.startsWith('//')) {
    s = `https:${s}`;
  }
  return s;
}

/**
 * 解析并识别用户导入的 Excel / CSV 表格中的商品标题、英文标题与黑白衣服图片 URL
 * 默认优先将提取的图片分配为黑色款衣服直链
 */
export async function parseProductTable(
  file: File,
  targetSheetIndex: number = 0,
  overrides?: ColumnMappingOverrides,
  defaultColorMode: 'black' | 'white' | 'both' = 'black'
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
    const headerName =
      rawHeader !== undefined && rawHeader !== null && String(rawHeader).trim() !== ''
        ? String(rawHeader).trim()
        : `未命名列 ${colIndexToLetter(colIdx)}`;

    // 提取样本值
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

  const matchColByKeywords = (keywords: string[]): number => {
    for (let i = 0; i < columns.length; i++) {
      const colNameLower = columns[i].name.toLowerCase();
      if (keywords.some((kw) => colNameLower.includes(kw.toLowerCase()))) {
        return i;
      }
    }
    return -1;
  };

  // 1. 标题列
  let titleColIdx = typeof overrides?.titleColIndex === 'number' ? overrides.titleColIndex : -1;
  if (titleColIdx < 0 || titleColIdx >= maxCols) {
    titleColIdx = matchColByKeywords(TITLE_KEYWORDS);
    if (titleColIdx === -1 && columns.length > 0) {
      titleColIdx = 0;
    }
  }

  // 2. 英文标题列
  let englishTitleColIdx = typeof overrides?.englishTitleColIndex === 'number' ? overrides.englishTitleColIndex : -1;
  if (englishTitleColIdx < 0 || englishTitleColIdx >= maxCols) {
    englishTitleColIdx = matchColByKeywords(ENGLISH_TITLE_KEYWORDS);
  }

  // 3. 黑白图片列识别
  let blackColIdx = typeof overrides?.blackColIndex === 'number' ? overrides.blackColIndex : -1;
  if (blackColIdx < 0 || blackColIdx >= maxCols) {
    blackColIdx = matchColByKeywords(BLACK_KEYWORDS);
  }

  let whiteColIdx = typeof overrides?.whiteColIndex === 'number' ? overrides.whiteColIndex : -1;
  if (whiteColIdx < 0 || whiteColIdx >= maxCols) {
    whiteColIdx = matchColByKeywords(WHITE_KEYWORDS);
  }

  // 4. 颜色列识别（如果用户表格是按颜色分行）
  let colorColIdx = typeof overrides?.colorColIndex === 'number' ? overrides.colorColIndex : -1;
  if (colorColIdx < 0 || colorColIdx >= maxCols) {
    colorColIdx = matchColByKeywords(COLOR_KEYWORDS);
  }

  // 5. 主图/默认图片列
  let imageColIdx = typeof overrides?.imageColIndex === 'number' ? overrides.imageColIndex : -1;
  if (imageColIdx < 0 || imageColIdx >= maxCols) {
    imageColIdx = matchColByKeywords(IMAGE_URL_KEYWORDS);
    // 样本 URL 检测
    if (imageColIdx === -1) {
      for (let i = 0; i < columns.length; i++) {
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
    if (imageColIdx === -1) {
      imageColIdx = columns.length > 1 ? (titleColIdx === 0 ? 1 : 0) : 0;
    }
  }

  // 如果没有独立找到特定颜色列，但检测到多列 URL
  if (whiteColIdx === -1 || blackColIdx === -1) {
    const urlCols: number[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (i === titleColIdx || i === englishTitleColIdx) continue;
      for (let r = headerRowIdx + 1; r < Math.min(rawMatrix.length, headerRowIdx + 10); r++) {
        const val = String(rawMatrix[r]?.[i] || '').trim();
        if (isHttpUrl(val)) {
          urlCols.push(i);
          break;
        }
      }
    }
    if (urlCols.length > 1) {
      if (blackColIdx === -1 && urlCols[0] !== undefined) blackColIdx = urlCols[0];
      if (whiteColIdx === -1 && urlCols[1] !== undefined) whiteColIdx = urlCols[1];
    }
  }

  // 6. 提取所有商品项
  const dataRows = rawMatrix.slice(headerRowIdx + 1);
  const items: TableProductItem[] = [];

  // 判断是否是按颜色分行 (例如同款商品多行，一行黑一行白)
  const isRowPerColorFormat =
    colorColIdx !== -1 &&
    dataRows.some((row, idx) => {
      if (idx === 0) return false;
      const prevTitle = String(dataRows[idx - 1]?.[titleColIdx] ?? '').trim();
      const curTitle = String(row?.[titleColIdx] ?? '').trim();
      return prevTitle && curTitle && prevTitle === curTitle;
    });

  if (isRowPerColorFormat) {
    // 按商品标题聚合分组
    const groupMap = new Map<string, {
      title: string;
      englishTitle?: string;
      rowIndex: number;
      rawRow: Record<string, any>;
      imageUrl: string;
      whiteUrl?: string;
      blackUrl?: string;
    }>();

    dataRows.forEach((row, idx) => {
      const rawTitle = String(row[titleColIdx] ?? '').trim();
      const rawImg = normalizeImageUrl(row[imageColIdx]);
      const colorVal = String(row[colorColIdx] ?? '').trim().toLowerCase();
      if (!rawTitle && !rawImg) return;

      const cleanedTitle = cleanChineseTitle(rawTitle) || `商品_${idx + 1}`;
      let entry = groupMap.get(cleanedTitle);
      if (!entry) {
        const rawRowObj: Record<string, any> = {};
        columns.forEach((col) => {
          rawRowObj[col.name] = row[col.index] ?? '';
        });
        entry = {
          title: cleanedTitle,
          englishTitle: englishTitleColIdx !== -1 ? String(row[englishTitleColIdx] ?? '').trim() : undefined,
          rowIndex: headerRowIdx + 2 + idx,
          rawRow: rawRowObj,
          imageUrl: rawImg,
        };
        groupMap.set(cleanedTitle, entry);
      }

      if (rawImg) {
        if (!entry.imageUrl) entry.imageUrl = rawImg;
        if (colorVal.includes('白') || colorVal.includes('white')) {
          entry.whiteUrl = rawImg;
        } else if (colorVal.includes('黑') || colorVal.includes('black')) {
          entry.blackUrl = rawImg;
        } else {
          // 根据 defaultColorMode 分配
          if (defaultColorMode === 'white') {
            entry.whiteUrl = entry.whiteUrl || rawImg;
          } else {
            entry.blackUrl = entry.blackUrl || rawImg;
          }
        }
      }
    });

    let gIdx = 0;
    groupMap.forEach((entry) => {
      gIdx++;
      const primaryUrl = entry.imageUrl || entry.blackUrl || entry.whiteUrl || '';
      items.push({
        id: `table_item_${gIdx}_${Math.random().toString(36).substring(2, 7)}`,
        rowIndex: entry.rowIndex,
        title: entry.title,
        englishTitle: entry.englishTitle,
        imageUrl: primaryUrl,
        blackUrl: entry.blackUrl || (defaultColorMode === 'black' ? primaryUrl : ''),
        whiteUrl: entry.whiteUrl || (defaultColorMode === 'white' ? primaryUrl : ''),
        isValidUrl: isHttpUrl(primaryUrl),
        rawRow: entry.rawRow,
      });
    });
  } else {
    // 标准行独立商品模式 (一行一个商品，多列颜色或单列主图)
    dataRows.forEach((row, idx) => {
      const rawTitle = String(row[titleColIdx] ?? '').trim();
      const mainImg = normalizeImageUrl(row[imageColIdx]);
      const bImg = blackColIdx !== -1 ? normalizeImageUrl(row[blackColIdx]) : '';
      const wImg = whiteColIdx !== -1 ? normalizeImageUrl(row[whiteColIdx]) : '';

      if (!rawTitle && !mainImg && !bImg && !wImg) {
        return;
      }

      const cleanedTitle = cleanChineseTitle(rawTitle) || `商品_${idx + 1}`;
      const primaryImg = bImg || wImg || mainImg || '';
      const engTitle = englishTitleColIdx !== -1 ? String(row[englishTitleColIdx] ?? '').trim() : undefined;

      const rowObj: Record<string, any> = {};
      columns.forEach((col) => {
        rowObj[col.name] = row[col.index] ?? '';
      });

      // 默认分配：依据 defaultColorMode，若只有主图，优先分配给黑色款（默认）或白色款
      const assignedBlackUrl = bImg || (defaultColorMode === 'white' ? '' : primaryImg);
      const assignedWhiteUrl = wImg || (defaultColorMode === 'white' ? primaryImg : (defaultColorMode === 'both' ? primaryImg : ''));

      items.push({
        id: `table_item_${idx + 1}_${Math.random().toString(36).substring(2, 7)}`,
        rowIndex: headerRowIdx + 2 + idx,
        title: cleanedTitle,
        englishTitle: engTitle ? cleanEnglishTitle(engTitle) : undefined,
        imageUrl: primaryImg,
        blackUrl: assignedBlackUrl,
        whiteUrl: assignedWhiteUrl,
        isValidUrl: isHttpUrl(primaryImg),
        rawRow: rowObj,
      });
    });
  }

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    activeSheetIndex: activeIdx,
    activeSheetName,
    columns,
    detectedTitleColIndex: titleColIdx,
    detectedEnglishTitleColIndex: englishTitleColIdx,
    detectedImageColIndex: imageColIdx,
    detectedWhiteColIndex: whiteColIdx,
    detectedBlackColIndex: blackColIdx,
    detectedColorColIndex: colorColIdx,
    items,
    totalRows: items.length,
  };
}

export interface ExportProductColorRow {
  title: string;
  originalUrl: string;
  selectedColor: 'black' | 'white';
  colorName: '黑色' | '白色';
  cjColumnValue?: string;
  eaColumnValue?: string;
}

/**
 * 导出已完成图片链接与黑白颜色填入的对照表格
 */
export function exportProcessedProductsExcel(
  items: ExportProductColorRow[],
  fileName: string = '商品黑白图片与颜色填入对照表.xlsx'
) {
  const exportData = items.map((item, idx) => ({
    序号: idx + 1,
    商品标题: item.title,
    衣服图片URL: item.originalUrl,
    人为判定颜色: item.colorName,
    表格填入颜色_EE列: item.cjColumnValue || item.colorName,
    表格填入图片直链_FV列: item.eaColumnValue || item.originalUrl,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '黑白颜色填入对照');

  worksheet['!cols'] = [
    { wch: 8 },  // 序号
    { wch: 35 }, // 商品标题
    { wch: 45 }, // 衣服图片URL
    { wch: 15 }, // 人为判定颜色
    { wch: 18 }, // 表格填入颜色_EE列
    { wch: 45 }, // 表格填入图片直链_FV列
  ];

  XLSX.writeFile(workbook, fileName);
}

/**
 * 将人为选好的黑色或白色直接回填入用户上传的原始表格中，并导出 Excel
 */
export async function exportOriginalTableWithColors(
  file: File,
  items: { id: string; rowIndex: number; selectedColor: 'black' | 'white'; colorName: string }[],
  targetSheetIndex: number = 0,
  specifiedColorColIndex?: number,
  outputFileName?: string
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const activeIdx = Math.min(Math.max(0, targetSheetIndex), workbook.SheetNames.length - 1);
  const activeSheetName = workbook.SheetNames[activeIdx];
  const worksheet = workbook.Sheets[activeSheetName];

  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
    const row = rawMatrix[i];
    if (row && row.some((c: any) => String(c || '').trim() !== '')) {
      headerRowIdx = i;
      break;
    }
  }

  let colorCol = specifiedColorColIndex;
  if (colorCol === undefined || colorCol < 0) {
    const headers = rawMatrix[headerRowIdx] || [];
    for (let c = 0; c < headers.length; c++) {
      const h = String(headers[c] || '').toLowerCase();
      if (COLOR_KEYWORDS.some((kw) => h.includes(kw))) {
        colorCol = c;
        break;
      }
    }
  }

  if (colorCol === undefined || colorCol < 0) {
    const maxCols = Math.max(...rawMatrix.map((r) => (Array.isArray(r) ? r.length : 0)));
    colorCol = maxCols;
    if (!rawMatrix[headerRowIdx]) rawMatrix[headerRowIdx] = [];
    rawMatrix[headerRowIdx][colorCol] = '颜色';
  }

  const rowColorMap = new Map<number, string>();
  items.forEach((it) => {
    rowColorMap.set(it.rowIndex, it.colorName);
  });

  const dataRowStart = headerRowIdx + 1;
  items.forEach((it, idx) => {
    const rIdx = dataRowStart + idx;
    if (!rowColorMap.has(rIdx)) {
      rowColorMap.set(rIdx, it.colorName);
    }
  });

  for (let r = dataRowStart; r < rawMatrix.length; r++) {
    const assignedColor = rowColorMap.get(r + 1) || rowColorMap.get(r);
    if (assignedColor) {
      if (!rawMatrix[r]) rawMatrix[r] = [];
      rawMatrix[r][colorCol] = assignedColor;
    }
  }

  const newWs = XLSX.utils.aoa_to_sheet(rawMatrix);
  workbook.Sheets[activeSheetName] = newWs;
  const fName = outputFileName || `${file.name.replace(/\.[^/.]+$/, '')}_已回填黑白颜色.xlsx`;
  XLSX.writeFile(workbook, fName);
}
