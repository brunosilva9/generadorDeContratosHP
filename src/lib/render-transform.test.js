import { describe, it, expect } from 'vitest';
import { replaceThinLineShapes, convertColumnSectionsToTables } from './render-transform';

describe('replaceThinLineShapes', () => {
  it('replaces a thin horizontal AlternateContent shape with underscores', () => {
    const xml =
      '<w:body>' +
      '<w:r><w:rPr><w:sz w:val="2"/></w:rPr>' +
      '<mc:AlternateContent><mc:Choice><w:drawing>' +
      '<wp:inline><wp:extent cx="1788160" cy="6985"/><a:graphic/></wp:inline>' +
      '</w:drawing></mc:Choice></mc:AlternateContent>' +
      '</w:r>' +
      '</w:body>';
    const out = replaceThinLineShapes(xml);
    expect(out).toMatch(/<w:t xml:space="preserve">_+<\/w:t>/);
    expect(out).not.toContain('<mc:AlternateContent');
    expect(out).toContain('w:sz w:val="16"');
  });

  it('leaves non-line drawings (large height) untouched', () => {
    const xml =
      '<w:r><w:rPr><w:sz w:val="20"/></w:rPr>' +
      '<mc:AlternateContent>' +
      '<wp:extent cx="1000000" cy="1000000"/>' +
      '</mc:AlternateContent></w:r>';
    expect(replaceThinLineShapes(xml)).toBe(xml);
  });
});

describe('convertColumnSectionsToTables', () => {
  it('converts a 2-column section with column-break into a 2-cell table', () => {
    const xml =
      '<w:body>' +
        '<w:p><w:r><w:t>Left col</w:t></w:r></w:p>' +
        '<w:p><w:r><w:br w:type="column"/></w:r></w:p>' +
        '<w:p><w:r><w:t>Right col</w:t></w:r></w:p>' +
        '<w:sectPr><w:cols w:num="2" w:space="720"/></w:sectPr>' +
      '</w:body>';
    const out = convertColumnSectionsToTables(xml);
    expect(out).toContain('<w:tbl>');
    expect(out).toContain('<w:tblGrid>');

    // Verify cell contents land in the right cells
    const cells = [...out.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1]);
    expect(cells.length).toBe(2);
    expect(cells[0]).toContain('Left col');
    expect(cells[0]).not.toContain('Right col');
    expect(cells[1]).toContain('Right col');
    expect(cells[1]).not.toContain('Left col');

    // Column-break paragraph removed
    expect(out).not.toContain('w:type="column"');
  });

  it('handles a sectPr inline in a paragraph (mid-document section break)', () => {
    const xml =
      '<w:body>' +
        '<w:p>' +
          '<w:pPr>' +
            '<w:sectPr><w:cols w:space="720"/></w:sectPr>' +
          '</w:pPr>' +
        '</w:p>' +
        '<w:p><w:r><w:t>Left</w:t></w:r></w:p>' +
        '<w:p><w:r><w:br w:type="column"/></w:r></w:p>' +
        '<w:p><w:r><w:t>Right</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>LastSig</w:t></w:r></w:p>' +
        '<w:sectPr><w:cols w:num="2" w:space="720"/></w:sectPr>' +
      '</w:body>';
    const out = convertColumnSectionsToTables(xml);
    const cells = [...out.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1]);
    expect(cells.length).toBe(2);
    expect(cells[0]).toContain('Left');
    // The last paragraph "LastSig" should land inside the second cell, not
    // outside the table.
    expect(cells[1]).toContain('Right');
    expect(cells[1]).toContain('LastSig');
  });

  it('leaves single-column sections untouched', () => {
    const xml =
      '<w:body>' +
        '<w:p><w:r><w:t>Hi</w:t></w:r></w:p>' +
        '<w:sectPr><w:cols w:space="720"/></w:sectPr>' +
      '</w:body>';
    expect(convertColumnSectionsToTables(xml)).toBe(xml);
  });

  it('does not transform a 2-column sectPr with no column-break inside', () => {
    const xml =
      '<w:body>' +
        '<w:p><w:r><w:t>Just one para</w:t></w:r></w:p>' +
        '<w:sectPr><w:cols w:num="2"/></w:sectPr>' +
      '</w:body>';
    expect(convertColumnSectionsToTables(xml)).toBe(xml);
  });
});
