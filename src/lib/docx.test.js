import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { fillTemplate, extractPlaceholders } from './docx';

async function makeDocx(documentXml) {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function readDocumentXml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

describe('extractPlaceholders', () => {
  it('finds simple placeholders', async () => {
    const buf = await makeDocx('<w:body><w:t>&lt;Nombre&gt; y &lt;Apellido&gt;</w:t></w:body>');
    const found = await extractPlaceholders(buf);
    expect(found.sort()).toEqual(['Apellido', 'Nombre']);
  });

  it('reassembles run-split placeholders', async () => {
    const xml = '<w:body><w:r><w:t>&lt;Nombre</w:t></w:r><w:r><w:t>Completo&gt;</w:t></w:r></w:body>';
    const buf = await makeDocx(xml);
    const found = await extractPlaceholders(buf);
    expect(found).toEqual(['NombreCompleto']);
  });

  it('ignores text that is not a valid identifier', async () => {
    const buf = await makeDocx('<w:body><w:t>&lt;123&gt; &lt;foo-bar&gt; &lt;&gt;</w:t></w:body>');
    const found = await extractPlaceholders(buf);
    expect(found).toEqual([]);
  });

  it('deduplicates repeated placeholders', async () => {
    const buf = await makeDocx('<w:body><w:t>&lt;X&gt; y &lt;X&gt;</w:t></w:body>');
    const found = await extractPlaceholders(buf);
    expect(found).toEqual(['X']);
  });
});

describe('fillTemplate', () => {
  it('substitutes simple placeholders', async () => {
    const buf = await makeDocx('<w:body><w:t>Hola &lt;Nombre&gt;</w:t></w:body>');
    const out = await fillTemplate(buf, { Nombre: 'Bruno' });
    const xml = await readDocumentXml(out);
    expect(xml).toContain('Hola Bruno');
  });

  it('reassembles and substitutes run-split placeholders', async () => {
    const xml = '<w:body><w:r><w:t>&lt;Nombre</w:t></w:r><w:r><w:t>Completo&gt;</w:t></w:r></w:body>';
    const buf = await makeDocx(xml);
    const out = await fillTemplate(buf, { NombreCompleto: 'Bruno Silva' });
    const result = await readDocumentXml(out);
    expect(result).toContain('Bruno Silva');
    expect(result).not.toContain('NombreCompleto');
  });

  it('escapes special XML chars in substituted values', async () => {
    const buf = await makeDocx('<w:body><w:t>&lt;Nombre&gt;</w:t></w:body>');
    const out = await fillTemplate(buf, { Nombre: 'A & B <C>' });
    const result = await readDocumentXml(out);
    expect(result).toContain('A &amp; B &lt;C&gt;');
  });

  it('leaves placeholders untouched when the field is missing from row', async () => {
    const buf = await makeDocx('<w:body><w:t>&lt;Nombre&gt; y &lt;Otro&gt;</w:t></w:body>');
    const out = await fillTemplate(buf, { Nombre: 'X' });
    const result = await readDocumentXml(out);
    expect(result).toContain('X y &lt;Otro&gt;');
  });

  it('scales font sizes when scale != 1', async () => {
    const xml = '<w:body><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>x</w:t></w:r></w:body>';
    const buf = await makeDocx(xml);
    const out = await fillTemplate(buf, {}, { scale: 0.5 });
    const result = await readDocumentXml(out);
    expect(result).toContain('w:sz w:val="12"');
    expect(result).toContain('w:szCs w:val="12"');
  });

  it('scales paragraph spacing and page margins', async () => {
    const xml =
      '<w:body><w:p><w:pPr><w:spacing w:before="240" w:after="240" w:line="276" w:lineRule="auto"/></w:pPr></w:p>' +
      '<w:sectPr><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body>';
    const buf = await makeDocx(xml);
    const out = await fillTemplate(buf, {}, { scale: 0.5 });
    const result = await readDocumentXml(out);
    expect(result).toContain('w:before="120"');
    expect(result).toContain('w:after="120"');
    expect(result).toContain('w:top="720"');
    // line spacing must NOT be scaled (depends on lineRule)
    expect(result).toContain('w:line="276"');
  });
});
