const PREFERRED_SHEET = 'Datos';

export async function parseExcel(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames.find((n) => n === PREFERRED_SHEET) ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('El archivo Excel no tiene hojas');

  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  if (matrix.length < 2) throw new Error('El Excel no tiene filas de datos');

  const headers = matrix[0]
    .map((h) => String(h ?? '').trim())
    .filter(Boolean);

  const rows = matrix
    .slice(1)
    .filter((r) => r.some((c) => c !== undefined && c !== null && String(c).trim() !== ''))
    .map((r) =>
      Object.fromEntries(
        headers.map((h, i) => [h, r[i] != null ? String(r[i]).trim() : ''])
      )
    );

  return { headers, rows, sheetName };
}
