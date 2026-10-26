import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { SheetInfo, TemplateSheetHeaderInfo } from './types';

/**
 * 将列号（1-based）转换为 Excel 列字母 (1 -> 'A', 27 -> 'AA', 131 -> 'EA')
 */
export function indexToColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * 将 Excel 列字母转换为列号（1-based）('A' -> 1, 'EA' -> 131)
 */
export function columnLetterToIndex(column: string): number {
  const clean = column.trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    index = index * 26 + (clean.charCodeAt(i) - 64);
  }
  return index;
}

export interface TemplateInspectionResult {
  fileName: string;
  sheets: SheetInfo[];
  sheetHeaders: TemplateSheetHeaderInfo[];
  detectedLabels: Array<{ sheetIndex: number; sheetName: string; cell: string; text: string; field: 'title' | 'englishTitle' | 'spuCode' | 'whiteImage' | 'blackImage' | 'static'; confidence: number }>;
}

const LABEL_RULES: Array<{ words: string[]; field: TemplateInspectionResult['detectedLabels'][number]['field']; confidence: number }> = [
  { words: ['商品标题', '中文标题', '标题'], field: 'title', confidence: 0.95 },
  { words: ['英文标题', '英文名', 'english title'], field: 'englishTitle', confidence: 0.95 },
  { words: ['spu', '商品编码', '款号'], field: 'spuCode', confidence: 0.92 },
  { words: ['白色图片', '白图', 'white image'], field: 'whiteImage', confidence: 0.9 },
  { words: ['黑色图片', '黑图', 'black image'], field: 'blackImage', confidence: 0.9 },
];

function detectLabel(text: string) {
  const normalized = text.toLowerCase().replaceAll(' ', '');
  return LABEL_RULES.find((rule) => rule.words.some((word) => normalized.includes(word.toLowerCase().replaceAll(' ', ''))));
}

/**
 * 深度解析导入的模板文件：提取所有子表及表头字段
 */
export async function inspectTemplateFile(file: File): Promise<TemplateInspectionResult> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheets: SheetInfo[] = workbook.worksheets.map((w, idx) => ({
      index: idx,
      name: w.name,
      isVisible: w.state === 'visible' || !w.state,
      isTarget: idx === (workbook.worksheets.length >= 2 ? 1 : 0),
    }));

    const sheetHeaders: TemplateSheetHeaderInfo[] = [];
    const detectedLabels: TemplateInspectionResult['detectedLabels'] = [];

    workbook.worksheets.forEach((ws, sheetIdx) => {
      const headersMap = new Map<
        number,
        { column: string; colIndex: number; headerName: string; sampleValues: string[] }
      >();

      // 扫描前 10 行提取列名与样例
      const maxScanRows = Math.min(ws.rowCount || 15, 12);
      for (let r = 1; r <= maxScanRows; r++) {
        const row = ws.getRow(r);
        if (row && row.cellCount > 0) {
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const rawVal = cell.value;
            let valStr = '';
            if (rawVal !== null && rawVal !== undefined) {
              if (typeof rawVal === 'object' && 'result' in (rawVal as any)) {
                valStr = String((rawVal as any).result || '');
              } else if (typeof rawVal === 'object' && 'text' in (rawVal as any)) {
                valStr = String((rawVal as any).text || '');
              } else {
                valStr = String(rawVal).trim();
              }
            }

            if (valStr) {
              const colLetter = indexToColumnLetter(colNumber);
              const detected = detectLabel(valStr);
              if (detected) detectedLabels.push({ sheetIndex: sheetIdx, sheetName: ws.name, cell: `${colLetter}${r}`, text: valStr, field: detected.field, confidence: detected.confidence });
              if (!headersMap.has(colNumber)) {
                headersMap.set(colNumber, {
                  column: colLetter,
                  colIndex: colNumber,
                  headerName: valStr,
                  sampleValues: [],
                });
              } else {
                const existing = headersMap.get(colNumber)!;
                if (existing.sampleValues.length < 3 && !existing.sampleValues.includes(valStr)) {
                  existing.sampleValues.push(valStr);
                }
                // 如果已有名字很短而后续更有描述性，补充显示
                if (existing.headerName.length < valStr.length && r <= 4) {
                  existing.headerName = `${existing.headerName} / ${valStr}`;
                }
              }
            }
          });
        }
      }

      const headers = Array.from(headersMap.values()).sort((a, b) => a.colIndex - b.colIndex);

      sheetHeaders.push({
        sheetName: ws.name,
        sheetIndex: sheetIdx,
        headers,
      });
    });

    return {
      fileName: file.name,
      sheets,
      sheetHeaders,
      detectedLabels,
    };
  } catch (err) {
    console.warn('ExcelJS inspection failed, fallback to XLSX:', err);

    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheets: SheetInfo[] = wb.SheetNames.map((name, idx) => ({
      index: idx,
      name,
      isVisible: true,
      isTarget: idx === (wb.SheetNames.length >= 2 ? 1 : 0),
    }));

    const sheetHeaders: TemplateSheetHeaderInfo[] = wb.SheetNames.map((name, sheetIdx) => {
      const ws = wb.Sheets[name];
      const headersMap = new Map<
        number,
        { column: string; colIndex: number; headerName: string; sampleValues: string[] }
      >();

      if (ws && ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        const maxR = Math.min(range.e.r, 10);
        for (let R = range.s.r; R <= maxR; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[cellAddress];
            if (cell && cell.v !== undefined && cell.v !== null) {
              const valStr = String(cell.v).trim();
              if (valStr) {
                const colNumber = C + 1;
                const colLetter = indexToColumnLetter(colNumber);
                if (!headersMap.has(colNumber)) {
                  headersMap.set(colNumber, {
                    column: colLetter,
                    colIndex: colNumber,
                    headerName: valStr,
                    sampleValues: [],
                  });
                } else {
                  const existing = headersMap.get(colNumber)!;
                  if (existing.sampleValues.length < 3 && !existing.sampleValues.includes(valStr)) {
                    existing.sampleValues.push(valStr);
                  }
                }
              }
            }
          }
        }
      }

      return {
        sheetName: name,
        sheetIndex: sheetIdx,
        headers: Array.from(headersMap.values()).sort((a, b) => a.colIndex - b.colIndex),
      };
    });

    return {
      fileName: file.name,
      sheets,
      sheetHeaders,
      detectedLabels: [],
    };
  }
}
