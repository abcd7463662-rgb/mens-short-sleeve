import ExcelJS from 'exceljs';

const SPORT_SIZES = [
  { size: 'S', shoulder: 41, bust: 88, length: 68, sleeve: 20 },
  { size: 'M', shoulder: 43, bust: 94, length: 70, sleeve: 20 },
  { size: 'L', shoulder: 45, bust: 100, length: 72, sleeve: 21 },
  { size: 'XL', shoulder: 47, bust: 106, length: 74, sleeve: 21 },
  { size: 'XXL', shoulder: 49, bust: 112, length: 76, sleeve: 22 },
];
const OLD_SIZE_ORDER = ['0XL', '1XL', '2XL', '3XL', '4XL', '5XL'];

function cellText(value: ExcelJS.CellValue): string {
  if (typeof value === 'object' && value && 'richText' in value) {
    return value.richText.map((part) => part.text).join('').trim();
  }
  return String(value ?? '').trim();
}

export async function repairSportWorkbookSizes(file: File): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const visibleSheets = workbook.worksheets.filter((sheet) => sheet.state === 'visible' || !sheet.state);
  const worksheet = visibleSheets[1] || workbook.worksheets[1] || visibleSheets[0] || workbook.worksheets[0];
  if (!worksheet) throw new Error('文件中没有可用的工作表');

  const spuRows: number[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (cellText(row.getCell('A').value).toLowerCase() === 'spu') spuRows.push(rowNumber);
  });
  if (!spuRows.length) throw new Error('没有识别到女士运动短袖商品区，请确认上传的是已导出的旧表格。');

  const validOldBlock = (spuRow: number) => {
    const sizes = Array.from({ length: 12 }, (_, index) => cellText(worksheet.getCell(`CI${spuRow + index + 1}`).value));
    const types = Array.from({ length: 12 }, (_, index) => cellText(worksheet.getCell(`A${spuRow + index + 1}`).value).toLowerCase());
    return types.every((type) => type === 'sku')
      && sizes.every((size, index) => size === OLD_SIZE_ORDER[index % OLD_SIZE_ORDER.length]);
  };
  if (!spuRows.every(validOldBlock)) {
    throw new Error('表格中的商品区不是完整的 0XL–5XL 女士运动短袖格式，未修改文件。');
  }

  for (const originalSpuRow of [...spuRows].reverse()) {
    worksheet.spliceRows(originalSpuRow + 12, 1);
    worksheet.spliceRows(originalSpuRow + 6, 1);
    worksheet.getCell(`AC${originalSpuRow}`).value = '否';
    worksheet.getCell(`AE${originalSpuRow}`).value = '圆领';

    for (let colorIndex = 0; colorIndex < 2; colorIndex++) {
      SPORT_SIZES.forEach((size, sizeIndex) => {
        const row = originalSpuRow + 1 + colorIndex * SPORT_SIZES.length + sizeIndex;
        worksheet.getCell(`CI${row}`).value = size.size;
        worksheet.getCell(`CJ${row}`).value = size.shoulder;
        worksheet.getCell(`CK${row}`).value = size.bust;
        worksheet.getCell(`CL${row}`).value = size.length;
        worksheet.getCell(`CM${row}`).value = size.sleeve;
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
