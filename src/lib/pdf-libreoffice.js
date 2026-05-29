// High-fidelity PDF path: converts each generated .docx to PDF with LibreOffice
// compiled to WebAssembly (ZetaOffice / zetajs), entirely in the browser. This
// is the same engine family that opens the .docx, so the PDF matches Word far
// better than the docx-preview raster fallback in pdf.js.
//
// The WASM runtime (~250-300 MB, cached after first load) streams from the
// ZetaOffice CDN. It needs cross-origin isolation (SharedArrayBuffer); see
// coi-serviceworker registration in main.jsx and the COOP/COEP dev headers in
// vite.config.js.

import JSZip from 'jszip';
import { fillTemplate } from './docx';

const ASSET_DIR = 'libreoffice/';

// Microsoft fonts (Arial, Calibri, Times New Roman, …) aren't in the WASM
// LibreOffice build, and PostScript-style names like "Arial MT" don't even hit
// its substitution table — so it falls back to a wider font and text overflows
// onto an extra page. We remap each MS font to its metric-compatible
// open-source equivalent that LibreOffice DOES bundle, so pagination matches
// Word. This is applied only on the PDF path; the ZIP .docx keeps its fonts.
const FONT_MAP = {
  'Arial': 'Liberation Sans',
  'Arial MT': 'Liberation Sans',
  'ArialMT': 'Liberation Sans',
  'Helvetica': 'Liberation Sans',
  'Tahoma': 'Liberation Sans',
  'Verdana': 'Liberation Sans',
  'Segoe UI': 'Liberation Sans',
  'Calibri': 'Carlito',
  'Calibri Light': 'Carlito',
  'Times New Roman': 'Liberation Serif',
  'TimesNewRomanPSMT': 'Liberation Serif',
  'Cambria': 'Caladea',
  'Courier New': 'Liberation Mono',
};

const FONT_XML_RE = /^word\/(document|styles|fontTable|settings|header\d+|footer\d+|theme\/theme\d+)\.xml$/;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Rewrites font names (as quoted attribute values, e.g. w:ascii="Arial MT" or
// w:name="Arial MT") to their metric-compatible equivalents.
async function remapFonts(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (!FONT_XML_RE.test(name)) continue;
    const xml = await zip.file(name).async('string');
    let next = xml;
    for (const [from, to] of Object.entries(FONT_MAP)) {
      next = next.replace(new RegExp(`="${escapeRegExp(from)}"`, 'g'), `="${to}"`);
    }
    if (next !== xml) {
      zip.file(name, next);
      changed = true;
    }
  }
  return changed ? zip.generateAsync({ type: 'arraybuffer' }) : buffer;
}

// Fit-to-page: LibreOffice paginates slightly differently from Word, so a
// 1-page template can spill onto a 2nd page once filled. We shrink the doc
// (font/spacing/margins via fillTemplate's scale) until the PDF is back within
// the template's own page count. Matches autofit.js bounds.
const MIN_SCALE = 0.6;
const SCALE_STEP = 0.05;
const roundScale = (s) => Math.round(s * 20) / 20;
const BOOT_TIMEOUT_MS = 180_000; // first load downloads the WASM bundle
const CONVERT_TIMEOUT_MS = 90_000;

let enginePromise = null;

// Cross-origin isolation is mandatory for the WASM threads. If it's missing,
// fail fast so the caller can fall back to the raster path instead of hanging.
export function isLibreOfficeSupported() {
  return typeof globalThis.crossOriginIsolated !== 'undefined'
    ? globalThis.crossOriginIsolated === true
    : false;
}

function assetUrl(file) {
  const base = import.meta.env.BASE_URL || '/';
  return new URL(`${base}${ASSET_DIR}${file}`, globalThis.location.origin).href;
}

// Boots LibreOffice once and returns an engine handle. Subsequent calls reuse
// the same boot promise.
function ensureEngine() {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    if (!isLibreOfficeSupported()) {
      throw new Error('LibreOffice WASM requiere cross-origin isolation (no disponible).');
    }

    // ZetaHelperMain reads #qtcanvas from the DOM; create a hidden one.
    if (!document.getElementById('qtcanvas')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'qtcanvas';
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    }

    const { ZetaHelperMain } = await import(/* @vite-ignore */ assetUrl('zetaHelper.js'));

    const pending = new Map(); // id -> { resolve, reject, timer }
    let nextId = 1;

    const zHM = new ZetaHelperMain(assetUrl('office-thread.js'), {
      threadJsType: 'module',
      wasmPkg: 'free',
    });

    await new Promise((resolve, reject) => {
      const bootTimer = setTimeout(
        () => reject(new Error('Timeout cargando el motor LibreOffice WASM.')),
        BOOT_TIMEOUT_MS
      );

      zHM.start(() => {
        zHM.thrPort.onmessage = (e) => {
          const d = e.data;
          if (d.cmd === 'ready') {
            clearTimeout(bootTimer);
            resolve();
            return;
          }
          const job = pending.get(d.id);
          if (!job) return;
          pending.delete(d.id);
          clearTimeout(job.timer);
          if (d.cmd === 'converted') {
            try {
              const bytes = zHM.FS.readFile(d.to);
              job.resolve(bytes);
            } catch (err) {
              job.reject(err);
            } finally {
              try { zHM.FS.unlink(d.from); } catch { /* best-effort cleanup */ }
              try { zHM.FS.unlink(d.to); } catch { /* best-effort cleanup */ }
            }
          } else if (d.cmd === 'error') {
            try { zHM.FS.unlink(d.from); } catch { /* best-effort cleanup */ }
            job.reject(new Error(d.message));
          }
        };
      });
    });

    // Converts one .docx ArrayBuffer to PDF bytes (Uint8Array).
    const convert = (buffer) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        const from = `/tmp/in_${id}.docx`;
        const to = `/tmp/out_${id}.pdf`;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Timeout convirtiendo el documento a PDF.'));
        }, CONVERT_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        try {
          zHM.FS.writeFile(from, new Uint8Array(buffer));
          zHM.thrPort.postMessage({ cmd: 'convert', id, from, to });
        } catch (err) {
          pending.delete(id);
          clearTimeout(timer);
          reject(err);
        }
      });

    return { convert };
  })();

  // If boot fails, clear the cached promise so a later attempt can retry.
  enginePromise.catch(() => { enginePromise = null; });
  return enginePromise;
}

async function convertToPdfDoc(engine, PDFDocument, buffer) {
  const remapped = await remapFonts(buffer);
  const bytes = await engine.convert(remapped);
  const doc = await PDFDocument.load(bytes);
  return { doc, pages: doc.getPageCount() };
}

// Returns the loaded PDF for one result, shrunk if needed so it doesn't exceed
// the template's own page count. `targetCache` memoizes each template's page
// count (one extra conversion per template).
async function buildFittedPdf(engine, PDFDocument, result, targetCache) {
  const template = result.template;
  const canRefill = template?.buffer && result.row;

  // result.buffer is already filled at the template's chosen scale.
  const asIs = await convertToPdfDoc(engine, PDFDocument, result.buffer);
  if (!canRefill) return asIs.doc;

  let target = targetCache.get(template);
  if (target === undefined) {
    target = (await convertToPdfDoc(engine, PDFDocument, template.buffer)).pages;
    targetCache.set(template, target);
  }

  if (asIs.pages <= target) return asIs.doc;

  // Overflow: step the scale down and take the largest scale that fits (best
  // legibility). Keep the smallest-scale attempt as a fallback if none fit.
  const baseScale = template.scale ?? 1;
  let fallback = asIs.doc;
  for (let scale = roundScale(baseScale - SCALE_STEP); scale >= MIN_SCALE - 1e-9; scale = roundScale(scale - SCALE_STEP)) {
    const refilled = await fillTemplate(template.buffer, result.row, { scale });
    const attempt = await convertToPdfDoc(engine, PDFDocument, refilled);
    if (attempt.pages <= target) return attempt.doc;
    fallback = attempt.doc;
  }
  return fallback;
}

// Converts each unique (row × template) .docx to PDF via LibreOffice, then
// merges them into one document, repeating each `copies` times for the print
// bundle. Mirrors buildCombinedPdf's contract in pdf.js.
export async function buildCombinedPdfLibreOffice(uniqueResults, onProgress) {
  const engine = await ensureEngine();
  const { PDFDocument } = await import('pdf-lib');

  const total = uniqueResults.reduce((s, r) => s + Math.max(1, r.copies ?? 1), 0);
  let done = 0;
  onProgress?.({ done, total });

  const merged = await PDFDocument.create();
  const targetCache = new Map();

  for (const result of uniqueResults) {
    const src = await buildFittedPdf(engine, PDFDocument, result, targetCache);
    const pageIndices = src.getPageIndices();
    const copies = Math.max(1, result.copies ?? 1);
    for (let c = 0; c < copies; c++) {
      const pages = await merged.copyPages(src, pageIndices);
      for (const p of pages) merged.addPage(p);
      done++;
      onProgress?.({ done, total });
    }
  }

  const bytes = await merged.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
