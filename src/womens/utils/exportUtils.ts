import * as XLSX from 'xlsx';

function downloadFile(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportModifiedWorkbook(workbook: XLSX.WorkBook, originalFileName: string) {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const baseName = originalFileName ? originalFileName.replace(/\.[^/.]+$/, '') : '表格';
  const outName = `${baseName}_修改后.xlsx`;
  downloadFile(
    wbout,
    outName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
