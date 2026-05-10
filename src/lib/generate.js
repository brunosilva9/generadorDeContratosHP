import JSZip from 'jszip';
import { fillTemplate } from './docx';
import { applyAutoEmails } from './email';

export function safeName(value, fallback = 'doc') {
  const cleaned = String(value ?? '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || fallback;
}

export function rowKey(row, headers, index) {
  const first = headers[0];
  return safeName(row?.[first], `fila_${index + 1}`);
}

// Returns { results, transformedRows }
// results: one entry per (row, template) where copies > 0; carries `copies` metadata
//   shape: { fileName, buffer, rowIndex, templateIndex, copies, rowLabel, templateName }
// The ZIP writes one of each; the PDF expands by `copies` for printing.
export async function generateAll({ rows, headers, templates, copies, autoEmail, autoEmails }, onProgress) {
  const effectiveRows = autoEmail ? applyAutoEmails(rows, headers, autoEmails ?? {}) : rows;

  let total = 0;
  for (let i = 0; i < effectiveRows.length; i++) {
    for (let j = 0; j < templates.length; j++) {
      if ((copies[i]?.[j] ?? 0) > 0) total++;
    }
  }

  const out = [];
  let done = 0;
  onProgress?.({ done, total });

  for (let i = 0; i < effectiveRows.length; i++) {
    const row = effectiveRows[i];
    const folder = rowKey(row, headers, i);
    const rowLabel = String(row[headers[0]] ?? `Fila ${i + 1}`);

    for (let j = 0; j < templates.length; j++) {
      const count = Math.max(0, copies[i]?.[j] ?? 0);
      if (count === 0) continue;

      const template = templates[j];
      const buffer = await fillTemplate(template.buffer, row, { scale: template.scale ?? 1 });
      const baseName = safeName(template.name.replace(/\.docx$/i, ''), 'plantilla');

      out.push({
        fileName: `${folder}/${baseName}.docx`,
        buffer,
        rowIndex: i,
        templateIndex: j,
        copies: count,
        rowLabel,
        templateName: template.name,
      });

      done++;
      onProgress?.({ done, total });
    }
  }
  return { results: out, transformedRows: effectiveRows };
}

export async function buildZip(results, { pdfFileName, includePdf = true } = {}, onProgress) {
  const zip = new JSZip();
  for (const r of results) zip.file(r.fileName, r.buffer);

  if (includePdf && results.length > 0) {
    onProgress?.({ phase: 'pdf', done: 0, total: results.reduce((s, r) => s + (r.copies ?? 1), 0) });
    const { buildCombinedPdf } = await import('./pdf');
    const pdfBlob = await buildCombinedPdf(results, (p) => onProgress?.({ ...p, phase: 'pdf' }));
    const stamp = new Date().toISOString().slice(0, 10);
    zip.file(pdfFileName ?? `Contratos_${stamp}.pdf`, pdfBlob);
  }

  onProgress?.({ phase: 'zip' });
  return zip.generateAsync({ type: 'blob' });
}
