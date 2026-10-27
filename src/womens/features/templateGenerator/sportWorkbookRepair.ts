import ExcelJS from 'exceljs';

function cellText(value: ExcelJS.CellValue): string {
  if (typeof value === 'object' && value && 'richText' in value) {
    return value.richText.map((part) => part.text).join('').trim();
  }
  return String(value ?? '').trim();
}

export async function repairSportWorkbookAttributes(file: File): Promise<Blob> {
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

  for (const row of spuRows) {
    worksheet.getCell(`AC${row}`).value = '否';
    worksheet.getCell(`AE${row}`).value = '圆领';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
