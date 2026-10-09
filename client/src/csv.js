// Builds a CSV file in the browser.
// Spreadsheet apps run cells that start with = + - @ (or tab/CR) as formulas, so a student
// named "=HYPERLINK(...)" could run something on the teacher's machine (CSV injection).
// Such cells get a leading apostrophe, which spreadsheets show as plain text.
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows) {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

export function downloadCsv(filename, rows) {
  // The BOM makes Excel read the file as UTF-8 (names with accents etc.).
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
