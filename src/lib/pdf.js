import { simplifyForRender } from './render-transform';

// A4 in millimeters
const PAGE_W = 210;
const PAGE_H = 297;
const A4_ASPECT = PAGE_H / PAGE_W; // 1.414…
const FIT_TOLERANCE = 0.12; // up to 12% taller than A4 still gets single-paged
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.85;
const BLANK_THRESHOLD = 245; // pixels with R,G,B all >= this count as "blank"
const BREAK_SEARCH_RADIUS_PX = 100; // smart-slice search radius around target row

const RENDER_ROOT_CLASS = 'pdf-render-root';

// Overrides docx-preview's default styling. Two important parts:
//   1. Removes the wrapper's gray background and section box-shadows.
//   2. Removes section.docx's `min-height` (set to A4 page height by default
//      via sectPr). Without this override every section captures as a full A4
//      even if it has 2 lines of content, blowing up our pagination.
function ensureStyleOverride() {
  if (document.getElementById('pdf-render-overrides')) return;
  const style = document.createElement('style');
  style.id = 'pdf-render-overrides';
  style.textContent = `
    .${RENDER_ROOT_CLASS},
    .${RENDER_ROOT_CLASS} .docx-wrapper { background: #fff !important; padding: 0 !important; box-shadow: none !important; }
    .${RENDER_ROOT_CLASS} section.docx {
      box-shadow: none !important;
      margin: 0 !important;
      border: 0 !important;
      min-height: 0 !important;
      height: auto !important;
    }
  `;
  document.head.appendChild(style);
}

// Renders one .docx with breakPages: true (so tab leaders, table widths and
// other page-context features render correctly). Captures each section.docx
// individually — sections grow to content height thanks to the CSS override.
async function renderDocCanvases(buffer, root, renderAsync, html2canvas) {
  const slot = document.createElement('div');
  Object.assign(slot.style, { width: `${PAGE_W}mm`, background: '#fff' });
  root.appendChild(slot);
  try {
    await renderAsync(buffer, slot, undefined, {
      inWrapper: false,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      experimental: true,
    });
    const sections = [...slot.querySelectorAll('section.docx')];
    const targets = sections.length > 0 ? sections : [slot];
    const canvases = [];
    for (const t of targets) {
      canvases.push(await html2canvas(t, {
        scale: RENDER_SCALE,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      }));
    }
    return canvases;
  } finally {
    slot.remove();
  }
}

// Stack all section canvases vertically into one big canvas. We always merge
// (vs the old "merge only if it fits A4" check) because docx-preview's
// pagination heuristic differs from Word's: a 1-Word-page doc can produce 2
// sections, and as long as their combined content fits A4 we want 1 PDF page.
function mergeCanvases(canvases) {
  if (canvases.length === 1) return canvases[0];
  const w = canvases[0].width;
  const totalH = canvases.reduce((s, c) => s + c.height, 0);
  const merged = document.createElement('canvas');
  merged.width = w;
  merged.height = totalH;
  const ctx = merged.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, totalH);
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height;
  }
  return merged;
}

// Searches near `targetY` for a fully-blank row (a "safe" point to slice that
// doesn't cut through text). Falls back to `targetY` if nothing blank found.
function findNearestBlankRow(canvas, targetY, searchRadius = BREAK_SEARCH_RADIUS_PX) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const minY = Math.max(0, targetY - searchRadius);
  const maxY = Math.min(h, targetY + searchRadius);
  if (maxY <= minY) return targetY;

  const region = ctx.getImageData(0, minY, w, maxY - minY).data;
  const regionH = maxY - minY;

  const isBlank = (yLocal) => {
    const base = yLocal * w * 4;
    for (let x = 0; x < w; x++) {
      const i = base + x * 4;
      if (region[i] < BLANK_THRESHOLD || region[i + 1] < BLANK_THRESHOLD || region[i + 2] < BLANK_THRESHOLD) {
        return false;
      }
    }
    return true;
  };

  let best = targetY;
  let bestDist = Infinity;
  for (let y = 0; y < regionH; y++) {
    if (isBlank(y)) {
      const absY = y + minY;
      const dist = Math.abs(absY - targetY);
      if (dist < bestDist) {
        bestDist = dist;
        best = absY;
      }
    }
  }
  return best;
}

// Returns array of { dataUrl, aspect } for one canvas. Single PDF page if it
// fits A4 (within tolerance); otherwise smart-slices at blank rows so we don't
// cut through text.
function paginateCanvas(canvas) {
  const aspect = canvas.height / canvas.width;
  const ratio = aspect / A4_ASPECT;

  if (ratio <= 1 + FIT_TOLERANCE) {
    return [{
      dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
      aspect: Math.min(aspect, A4_ASPECT),
    }];
  }

  const pageCount = Math.ceil(ratio);
  const idealH = canvas.height / pageCount;
  const breaks = [0];
  for (let i = 1; i < pageCount; i++) {
    breaks.push(findNearestBlankRow(canvas, Math.round(i * idealH)));
  }
  breaks.push(canvas.height);

  const out = [];
  for (let i = 0; i < pageCount; i++) {
    const yStart = breaks[i];
    const yEnd = breaks[i + 1];
    if (yEnd <= yStart) continue;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = yEnd - yStart;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -yStart);
    out.push({
      dataUrl: slice.toDataURL('image/jpeg', JPEG_QUALITY),
      aspect: slice.height / slice.width,
    });
  }
  return out;
}

export async function buildCombinedPdf(uniqueResults, onProgress) {
  const [{ renderAsync }, { default: html2canvas }, { jsPDF }] = await Promise.all([
    import('docx-preview'),
    import('html2canvas'),
    import('jspdf'),
  ]);

  ensureStyleOverride();

  const root = document.createElement('div');
  root.className = RENDER_ROOT_CLASS;
  Object.assign(root.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    width: `${PAGE_W}mm`,
    background: '#fff',
  });
  document.body.appendChild(root);

  const totalInstances = uniqueResults.reduce((s, r) => s + (r.copies ?? 1), 0);

  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    let firstPage = true;
    let instancesDone = 0;
    onProgress?.({ done: instancesDone, total: totalInstances });

    for (const result of uniqueResults) {
      const renderBuffer = await simplifyForRender(result.buffer);
      const canvases = await renderDocCanvases(renderBuffer, root, renderAsync, html2canvas);
      const merged = mergeCanvases(canvases);
      const pageImages = paginateCanvas(merged);

      const copies = Math.max(1, result.copies ?? 1);
      for (let c = 0; c < copies; c++) {
        for (const img of pageImages) {
          if (!firstPage) pdf.addPage();
          firstPage = false;
          pdf.addImage(img.dataUrl, 'JPEG', 0, 0, PAGE_W, PAGE_W * img.aspect);
        }
        instancesDone++;
        onProgress?.({ done: instancesDone, total: totalInstances });
      }
    }

    return pdf.output('blob');
  } finally {
    root.remove();
  }
}
