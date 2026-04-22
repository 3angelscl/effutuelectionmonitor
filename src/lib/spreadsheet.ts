/**
 * Spreadsheet read/write helpers backed by ExcelJS (XLSX) and PapaParse (CSV).
 *
 * Read path   – used by upload routes (voters, stations, agents)
 * Write path  – used by export routes (voters, turnout, results)
 */

import ExcelJS from 'exceljs';
import Papa from 'papaparse';

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * Parse an uploaded file (CSV or XLSX) into an array of row objects.
 * Column headers become object keys.
 */
export async function readUploadedFile(
  file: File,
): Promise<Record<string, unknown>[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    return readCsvFile(file);
  }

  return readExcelFile(file);
}

async function readCsvFile(file: File): Promise<Record<string, unknown>[]> {
  const text = await file.text();
  if (!text.trim()) return [];

  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep everything as strings for consistent downstream handling
  });

  return result.data;
}

async function readExcelFile(file: File): Promise<Record<string, unknown>[]> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validate magic bytes before passing to the parser.
  // XLSX is a ZIP (50 4B 03 04). We do not support legacy XLS files.
  const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (!isXlsx) {
    throw new Error('Invalid file format. Please upload an .xlsx or .csv file.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const val = String(cell.value ?? '').trim();
    if (val) {
      headers[colNumber] = val;
    }
  });

  // Filter out any potential sparse entries (though eachCell should be fine)
  // and keep a clean list of unique keys
  const validHeaders = headers.filter(h => !!h);

  const rows: Record<string, unknown>[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, unknown> = {};
    let hasValue = false;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) {
        const val = cell.value;
        obj[key] = val !== null && val !== undefined ? String(val).trim() : '';
        if (obj[key] !== '') hasValue = true;
      }
    });

    // Fill in missing columns with empty strings
    for (const h of validHeaders) {
      if (!(h in obj)) obj[h] = '';
    }

    if (hasValue) rows.push(obj);
  }

  return rows;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Build a downloadable XLSX buffer from an array of row objects.
 */
export async function buildXlsx(
  rows: Record<string, unknown>[],
  sheetName = 'Sheet1',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  if (rows.length === 0) {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const columns = Object.keys(rows[0]);
  sheet.columns = columns.map((key) => ({ header: key, key }));

  for (const row of rows) {
    sheet.addRow(row);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Build a downloadable CSV string from an array of row objects.
 */
export function buildCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  return Papa.unparse(rows);
}
