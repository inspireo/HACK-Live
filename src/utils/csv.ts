/**
 * Utility to export a grid of data as a CSV file in browsers.
 * Implements proper UTF-8 encoding with BOM, escapes commas/newlines,
 * and handles custom download triggers.
 */
export function exportToCSV(filename: string, headers: string[], rows: string[][]) {
  const escapeField = (field: any) => {
    if (field === null || field === undefined) return '';
    const stringified = String(field);
    if (
      stringified.includes(',') ||
      stringified.includes('"') ||
      stringified.includes('\n') ||
      stringified.includes('\r')
    ) {
      return `"${stringified.replace(/"/g, '""')}"`;
    }
    return stringified;
  };

  const csvContent = [
    headers.map(escapeField).join(','),
    ...rows.map(row => row.map(escapeField).join(','))
  ].join('\r\n');

  // Enforce UTF-8 via BOM (Byte Order Mark) for Excel compatibility
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], {
    type: 'text/csv;charset=utf-8;'
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
