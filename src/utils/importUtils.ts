import * as XLSX from 'xlsx';

export interface ProcessedWorkbookResult {
  fileName: string;
  workbook: XLSX.WorkBook;
  targetSheetName: string;
  sheetCount: number;
  message: string;
}

export function processAndModifyWorkbook(file: File): Promise<ProcessedWorkbookResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('无法读取文件内容');
        }

        const workbook = XLSX.read(data, { type: 'array', cellStyles: true, cellDates: true });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('文件中未找到有效的工作表');
        }

        // Check if there is a second sheet (子表)
        let targetSheetName = '';
        if (workbook.SheetNames.length >= 2) {
          targetSheetName = workbook.SheetNames[1];
        } else {
          // If only 1 sheet exists, create a second sheet
          targetSheetName = 'Sheet2';
          workbook.SheetNames.push(targetSheetName);
          workbook.Sheets[targetSheetName] = XLSX.utils.aoa_to_sheet([]);
        }

        const secondSheet = workbook.Sheets[targetSheetName];
        if (!secondSheet) {
          workbook.Sheets[targetSheetName] = XLSX.utils.aoa_to_sheet([]);
        }

        const sheet = workbook.Sheets[targetSheetName];

        // Column A, Row 6 in Excel is cell 'A6' (0-indexed col: 0, row: 5)
        sheet['A6'] = {
          t: 's',
          v: 'SPU',
        };

        // Ensure !ref covers cell A6 (row index 5, col index 0)
        let range: XLSX.Range = { s: { r: 0, c: 0 }, e: { r: 5, c: 0 } };
        if (sheet['!ref']) {
          const decoded = XLSX.utils.decode_range(sheet['!ref']);
          range.s.r = Math.min(decoded.s.r, 0);
          range.s.c = Math.min(decoded.s.c, 0);
          range.e.r = Math.max(decoded.e.r, 5);
          range.e.c = Math.max(decoded.e.c, 0);
        }
        sheet['!ref'] = XLSX.utils.encode_range(range);

        resolve({
          fileName: file.name,
          workbook,
          targetSheetName,
          sheetCount: workbook.SheetNames.length,
          message: `已在第二个子表「${targetSheetName}」A列第6行 (A6) 填入 "SPU"`,
        });
      } catch (err: any) {
        reject(new Error(err.message || '文件解析与修改失败'));
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取出错'));
    };

    reader.readAsArrayBuffer(file);
  });
}
