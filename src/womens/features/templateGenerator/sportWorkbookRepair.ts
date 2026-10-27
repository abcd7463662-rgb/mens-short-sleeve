import ExcelJS from 'exceljs';

const SPORT_SIZES = [
  { size: 'S', shoulder: 41, bust: 88, length: 68, sleeve: 20 },
  { size: 'M', shoulder: 43, bust: 94, length: 70, sleeve: 20 },
  { size: 'L', shoulder: 45, bust: 100, length: 72, sleeve: 21 },
  { size: 'XL', shoulder: 47, bust: 106, length: 74, sleeve: 21 },
  { size: 'XXL', shoulder: 49, bust: 112, length: 76, sleeve: 22 },
];
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

  const blocks = spuRows.map((spuRow, index) => {
    const nextSpuRow = spuRows[index + 1] ?? worksheet.rowCount + 1;
    const skuRows: number[] = [];
    for (let row = spuRow + 1; row < nextSpuRow; row++) {
      if (cellText(worksheet.getCell(`A${row}`).value).toLowerCase() !== 'sku') break;
      skuRows.push(row);
    }
    const colorCount = skuRows.length === 12 ? 6 : 5;
    const colorOne = skuRows.slice(0, colorCount).map((row) => cellText(worksheet.getCell(`CE${row}`).value));
    const colorTwo = skuRows.slice(colorCount).map((row) => cellText(worksheet.getCell(`CE${row}`).value));
    const completeColorGroups = [colorOne, colorTwo].every((group) =>
      group.length === colorCount && group[0] && group.every((color) => color === group[0])
    ) && colorOne[0] !== colorTwo[0];
    if (![10, 12].includes(skuRows.length) || !completeColorGroups) {
      throw new Error(`第 ${spuRow} 行商品区无法识别为两色各 5 或 6 行 SKU；文件未修改。`);
    }
    return { spuRow, skuRows, colorCount };
  });

  for (const block of [...blocks].reverse()) {
    const { spuRow, skuRows, colorCount } = block;
    if (skuRows.length === 12) {
      worksheet.spliceRows(spuRow + 1 + colorCount * 2 - 1, 1);
      worksheet.spliceRows(spuRow + colorCount, 1);
    }
    worksheet.getCell(`AC${spuRow}`).value = '否';
    worksheet.getCell(`AE${spuRow}`).value = '圆领';

    for (let colorIndex = 0; colorIndex < 2; colorIndex++) {
      SPORT_SIZES.forEach((size, sizeIndex) => {
        const row = spuRow + 1 + colorIndex * SPORT_SIZES.length + sizeIndex;
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
