import JSZip from 'jszip';

const DOCUMENT_XML = 'word/document.xml';

// Word documents often render signature lines as DrawingML shapes
// (<mc:AlternateContent> wrapping <w:drawing> with <wpg:wgp> custom geometry).
// docx-preview does not render those reliably, so for the PDF/preview path we
// substitute thin horizontal shapes with underscore text. We also convert
// multi-column sections (Word's <w:cols w:num="N">) into tables, because
// docx-preview ignores explicit <w:br w:type="column"/> markers and reflows
// content across columns. The original .docx (the one that goes into the ZIP)
// is left untouched — Word renders both features fine.
export async function simplifyForRender(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file(DOCUMENT_XML);
  if (!entry) return buffer;
  const xml = await entry.async('string');
  let transformed = replaceThinLineShapes(xml);
  transformed = convertColumnSectionsToTables(transformed);
  if (transformed === xml) return buffer;
  zip.file(DOCUMENT_XML, transformed);
  return zip.generateAsync({ type: 'arraybuffer' });
}

// EMU thresholds: 914400 EMU = 1 inch.
//   cy <  50000 EMU ≈ 0.05" (≈ 1.3 mm) — very thin = line, not a shape
//   cx > 450000 EMU ≈ 0.5"  (≈ 12 mm)  — wide enough to be a separator/line
const THIN_HEIGHT_EMU = 50000;
const MIN_WIDTH_EMU = 450000;
const EMU_PER_UNDERSCORE = 50000;
const MIN_UNDERSCORES = 20;
const MAX_UNDERSCORES = 200;
const MIN_VISIBLE_HALFPOINTS = 16;

export function replaceThinLineShapes(xml) {
  return xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (rText) => {
    if (!rText.includes('<mc:AlternateContent')) return rText;
    const extent = rText.match(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/);
    if (!extent) return rText;
    const cx = +extent[1];
    const cy = +extent[2];
    if (cy >= THIN_HEIGHT_EMU || cx <= MIN_WIDTH_EMU) return rText;

    const count = Math.max(
      MIN_UNDERSCORES,
      Math.min(MAX_UNDERSCORES, Math.round(cx / EMU_PER_UNDERSCORE))
    );

    const sized = rText
      .replace(/<w:sz w:val="(\d+)"\s*\/>/g, (_, v) =>
        `<w:sz w:val="${Math.max(+v, MIN_VISIBLE_HALFPOINTS)}"/>`)
      .replace(/<w:szCs w:val="(\d+)"\s*\/>/g, (_, v) =>
        `<w:szCs w:val="${Math.max(+v, MIN_VISIBLE_HALFPOINTS)}"/>`);

    return sized.replace(
      /<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>/,
      `<w:t xml:space="preserve">${'_'.repeat(count)}</w:t>`
    );
  });
}

// Converts each multi-column section (sectPr with <w:cols w:num="N">) into a
// 1-row N-cell table. <w:br w:type="column"/> paragraphs become cell
// boundaries. docx-preview renders tables predictably, so this gives stable
// side-by-side layout that browser CSS columns don't reliably provide.
export function convertColumnSectionsToTables(xml) {
  const sectPrRegex = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g;
  const sectPrs = [...xml.matchAll(sectPrRegex)];
  if (sectPrs.length === 0) return xml;

  // Process from last to first so earlier offsets remain valid.
  let result = xml;
  let prevContentEnd = bodyStart(xml);

  // Build sections: { contentStart, contentEnd, numCols }
  const sections = [];
  for (const m of sectPrs) {
    const numColsMatch = m[0].match(/<w:cols\s+w:num="(\d+)"/);
    const numCols = numColsMatch ? +numColsMatch[1] : 1;

    const sectPrIdx = m.index;
    const sectPrEnd = m.index + m[0].length;

    // Section content ends at the start of the <w:p> that wraps this sectPr
    // (if any), or at the sectPr itself when it's a direct child of <w:body>.
    // To tell which case we're in, the sectPr is inside a paragraph only when
    // there's an UNCLOSED <w:p> in `beforeSectPr` (i.e. the latest <w:p ...> is
    // not yet closed by </w:p>).
    const beforeSectPr = xml.substring(prevContentEnd, sectPrIdx);
    const lastPOpen = lastIndexOfPStart(beforeSectPr);
    const lastPClose = beforeSectPr.lastIndexOf('</w:p>');
    const sectPrInsideP = lastPOpen !== -1 && lastPClose < lastPOpen;

    let contentEnd, sectionEndAbs;
    if (sectPrInsideP) {
      contentEnd = prevContentEnd + lastPOpen;
      const closeP = xml.indexOf('</w:p>', sectPrEnd);
      sectionEndAbs = closeP !== -1 ? closeP + '</w:p>'.length : sectPrEnd;
    } else {
      contentEnd = sectPrIdx;
      sectionEndAbs = sectPrEnd;
    }

    sections.push({ contentStart: prevContentEnd, contentEnd, numCols });
    prevContentEnd = sectionEndAbs;
  }

  // Apply transformations from last to first
  for (let i = sections.length - 1; i >= 0; i--) {
    const s = sections[i];
    if (s.numCols < 2) continue;
    const content = result.substring(s.contentStart, s.contentEnd);
    if (!/<w:br w:type="column"\/>/.test(content)) continue;
    const replacement = buildTableFromColumnSection(content, s.numCols);
    result = result.substring(0, s.contentStart) + replacement + result.substring(s.contentEnd);
  }

  return result;
}

function bodyStart(xml) {
  const idx = xml.indexOf('<w:body>');
  return idx === -1 ? 0 : idx + '<w:body>'.length;
}

function lastIndexOfPStart(s) {
  const a = s.lastIndexOf('<w:p ');
  const b = s.lastIndexOf('<w:p>');
  return Math.max(a, b);
}

function buildTableFromColumnSection(content, numCols) {
  const parts = splitAtColumnBreaks(content);
  while (parts.length < numCols) parts.push('');
  while (parts.length > numCols) {
    const extra = parts.pop();
    parts[parts.length - 1] += extra;
  }

  const cellPctW = Math.floor(5000 / numCols);
  const grid = parts.map(() => `<w:gridCol w:w="${cellPctW}"/>`).join('');
  const cells = parts
    .map((p) => {
      const safe = p.trim() || '<w:p/>';
      return `<w:tc><w:tcPr><w:tcW w:w="${cellPctW}" w:type="pct"/></w:tcPr>${safe}</w:tc>`;
    })
    .join('');

  return (
    '<w:tbl>' +
      '<w:tblPr>' +
        '<w:tblW w:w="5000" w:type="pct"/>' +
        '<w:tblLayout w:type="fixed"/>' +
        '<w:tblBorders>' +
          '<w:top w:val="nil"/>' +
          '<w:left w:val="nil"/>' +
          '<w:bottom w:val="nil"/>' +
          '<w:right w:val="nil"/>' +
          '<w:insideH w:val="nil"/>' +
          '<w:insideV w:val="nil"/>' +
        '</w:tblBorders>' +
      '</w:tblPr>' +
      `<w:tblGrid>${grid}</w:tblGrid>` +
      `<w:tr>${cells}</w:tr>` +
    '</w:tbl>'
  );
}

function splitAtColumnBreaks(content) {
  const parts = [];
  let lastEnd = 0;
  const regex = /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<w:br w:type="column"\/>(?:[\s\S])*?<\/w:p>/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    parts.push(content.substring(lastEnd, m.index));
    lastEnd = m.index + m[0].length;
  }
  parts.push(content.substring(lastEnd));
  return parts;
}
