import JSZip from 'jszip';

const DOCUMENT_XML = 'word/document.xml';

export async function extractPlaceholders(templateBuffer) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const entry = zip.file(DOCUMENT_XML);
  if (!entry) return [];
  const xml = await entry.async('string');
  return findPlaceholderNames(xml);
}

function findPlaceholderNames(xml) {
  const names = new Set();
  let pos = 0;
  while (pos < xml.length) {
    const lt = xml.indexOf('&lt;', pos);
    if (lt === -1) break;
    const gt = xml.indexOf('&gt;', lt + 4);
    if (gt === -1) break;
    const inner = xml.substring(lt + 4, gt);
    const fieldName = inner.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    if (fieldName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) names.add(fieldName);
    pos = gt + 4;
  }
  return [...names];
}

export async function fillTemplate(templateBuffer, rowData, options = {}) {
  const { scale = 1 } = options;
  const zip = await JSZip.loadAsync(templateBuffer);
  const entry = zip.file(DOCUMENT_XML);
  if (!entry) throw new Error('Plantilla .docx inválida: falta word/document.xml');

  let xml = await entry.async('string');
  xml = substitutePlaceholders(xml, rowData);
  if (scale !== 1) {
    xml = scaleFontSizes(xml, scale);
    xml = scaleSpacingAndMargins(xml, scale);
  }
  zip.file(DOCUMENT_XML, xml);
  return zip.generateAsync({ type: 'arraybuffer' });
}

// Word stores the literal text "<Field>" as "&lt;Field&gt;" in document.xml,
// and may split the inner text across multiple <w:r> runs whenever the user's
// typing introduced formatting boundaries. We scan for &lt;...&gt; pairs and
// strip any interleaved tags before matching the field name.
function substitutePlaceholders(xml, rowData) {
  let pos = 0;
  let out = '';

  while (pos < xml.length) {
    const lt = xml.indexOf('&lt;', pos);
    if (lt === -1) {
      out += xml.substring(pos);
      break;
    }
    out += xml.substring(pos, lt);

    const gt = xml.indexOf('&gt;', lt + 4);
    if (gt === -1) {
      out += xml.substring(lt);
      break;
    }

    const inner = xml.substring(lt + 4, gt);
    const fieldName = inner.replace(/<[^>]*>/g, '').replace(/\s+/g, '');

    if (fieldName && Object.prototype.hasOwnProperty.call(rowData, fieldName)) {
      const value = rowData[fieldName];
      out += value != null ? escapeXml(String(value)) : '';
    } else {
      out += xml.substring(lt, gt + 4);
    }

    pos = gt + 4;
  }

  return out;
}

// Word font sizes are in half-points (val=24 → 12pt). Multiply <w:sz> and
// <w:szCs> values to shrink/grow content so it fits the original page count.
function scaleFontSizes(xml, scale) {
  const apply = (_match, attr, val) => {
    const scaled = Math.max(2, Math.round(Number(val) * scale));
    return `<w:${attr} w:val="${scaled}"/>`;
  };
  return xml
    .replace(/<w:(sz) w:val="(\d+)"\s*\/>/g, apply)
    .replace(/<w:(szCs) w:val="(\d+)"\s*\/>/g, apply);
}

// Scale paragraph before/after spacing and page margins (both in twips).
// Skips <w:line> because its meaning depends on <w:lineRule> (auto = 240ths of
// "single line", scaling would distort layout).
function scaleSpacingAndMargins(xml, scale) {
  const scaleAttr = (name) =>
    new RegExp(`\\b${name}="(\\d+)"`, 'g');

  const targets = ['w:before', 'w:after', 'w:top', 'w:bottom', 'w:left', 'w:right', 'w:header', 'w:footer', 'w:gutter'];
  // Only touch attributes inside <w:spacing ...> and <w:pgMar ...> tags.
  return xml.replace(/<w:(spacing|pgMar)\b([^/>]*)\/?>/g, (match, _tag, attrs) => {
    let updated = attrs;
    for (const t of targets) {
      updated = updated.replace(scaleAttr(t), (_, v) => `${t}="${Math.max(0, Math.round(+v * scale))}"`);
    }
    return match.replace(attrs, updated);
  });
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
