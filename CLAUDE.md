# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server with HMR
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run lint` — ESLint over the repo (flat config in [eslint.config.js](eslint.config.js))
- `npm test` — run vitest once
- `npm run test:watch` — vitest in watch mode

UI is in Spanish.

## What this app does

A 100% client-side SPA (no backend, no Word install required) that mass-generates Word contract files from an Excel data sheet plus one or more `.docx` templates. The user uploads an Excel and N templates, edits any mistyped cells inline, configures how many copies of each template per row, and downloads two artifacts:

- **ZIP**: `{personFolder}/{template}.docx` — exactly **one** file per (row × template). The digital archive.
- **PDF (separate download)**: every (row × template) repeated `copies` times. The print-ready bundle.

Reference inputs live (untracked) in `Docs/`: `Contratos.xlsm` is the prototype data sheet; `MODELO.docx`, `MODELO2.docx`, `MODELO3.docx` are sample templates.

## Architecture

Three-stage flow orchestrated by [src/App.jsx](src/App.jsx):

1. **Upload** ([src/components/UploadStep.jsx](src/components/UploadStep.jsx)) — pick Excel + N templates. Each template is parsed for placeholders on upload, and a validation card warns about placeholders without matching Excel columns (and unused columns).
2. **Configure** ([src/components/ConfigureStep.jsx](src/components/ConfigureStep.jsx)) — editable preview of all rows, options checkboxes (auto-email), copies × scale matrix per (row × template).
3. **Generate** ([src/components/GenerateStep.jsx](src/components/GenerateStep.jsx)) — runs generation, exposes ZIP download, PDF download, and "Vista previa" overlay ([PrintView.jsx](src/components/PrintView.jsx)).

State lives in `App.jsx`: `excel`, `templates`, `copies`, `options`, `autoEmails`, `stage`. Two persistence patterns to know:

- **IndexedDB persistence** ([src/lib/persistence.js](src/lib/persistence.js)): every state change is debounced-saved (200ms). On mount, hydrate from storage. Templates serialize their `ArrayBuffer` natively via structured clone. If the quota fails, the store falls back to slim state (no buffers) and the UI shows a banner asking the user to re-upload templates.
- **`copies` reshape on stage transition**, not in `useEffect`, because `react-hooks/set-state-in-effect` forbids the latter. Done inside `goTo('configure')`.

### Library layer ([src/lib/](src/lib/))

- [excel.js](src/lib/excel.js) — `parseExcel(file)`. Lazy-imports `xlsx`. Prefers a sheet named `Datos`, falls back to the first sheet.
- [docx.js](src/lib/docx.js) — `fillTemplate(buffer, rowData, { scale })` and `extractPlaceholders(buffer)`. The placeholder substitution algorithm (see below). When `scale !== 1`, also scales `<w:sz>`/`<w:szCs>` (font, half-points), `<w:spacing w:before|w:after>` and `<w:pgMar>` (twips). **Does not** scale `<w:line>` because its meaning depends on `<w:lineRule>` (auto = 240ths of "single line", scaling distorts).
- [email.js](src/lib/email.js) — `applyAutoEmails(rows, headers, precomputed)` fills empty `EMAILTRABAJADOR` cells with `nombre.apellido.suffix@gmail.com`, where suffix is randomly 2 letters / 2-4 digits. Name detection: looks for headers matching `/nombre/`/`/apellido/`, falls back to splitting the first column. `precomputed` lets the caller pass cached emails (so the UI preview matches the generated value).
- [autofit.js](src/lib/autofit.js) — `suggestScale(templateBuffer, sampleRow)` renders the original and a filled sample with `docx-preview`, counts `section.docx` elements (= pages), and returns the scale factor that brings the filled doc back to the original page count. Clamped to [0.6, 1.0] in 5% steps. Triggered per template by the "auto" button in the matrix header.
- [generate.js](src/lib/generate.js) — `generateAll({ rows, headers, templates, copies, autoEmail, autoEmails }, onProgress)` returns **unique** results (one entry per row × template where copies > 0; carries `copies` count as metadata). `buildZip(results)` writes one of each.
- [pdf.js](src/lib/pdf.js) — `buildCombinedPdf(uniqueResults, onProgress)`. Lazy-imports `docx-preview`, `html2canvas`, `jspdf`. **Renders each unique result once**, captures the page images, and adds them to the PDF `copies` times. This dedupe is why the function takes unique results rather than expanded ones.

### The placeholder substitution trick (the only non-obvious part of the codebase)

Templates use placeholders written as `<FieldName>` *literally* in the document text (matching column headers in the Excel). When Word saves the file, the angle brackets in the body are stored HTML-encoded as `&lt;` and `&gt;` in `word/document.xml`. So the scan in [docx.js](src/lib/docx.js) walks the XML looking for `&lt;...&gt;` pairs, **not** `<...>` pairs.

Inside a placeholder, Word may split the text across multiple inline runs (e.g. `&lt;<w:r>...</w:r>FieldName<w:r>...</w:r>&gt;`) because of formatting boundaries Word inserted while the user typed. The line `inner.replace(/<[^>]*>/g, '').replace(/\s+/g, '')` strips those interleaved `<w:...>` tags and whitespace so the field name reassembles cleanly. **Do not "simplify" this to a regex over the raw XML** — the run-splitting is the whole reason the manual scan exists.

If a matched field name has no corresponding column in the row, the original substring is preserved verbatim (placeholder left untouched), not blanked out. Substituted values are XML-escaped so names with `&`/`<`/`>` don't corrupt the document.

`extractPlaceholders` uses the same scan but collects names into a Set instead of substituting, with an extra `^[A-Za-z_][A-Za-z0-9_]*$` filter so random `&lt;...&gt;` text isn't treated as a placeholder.

### PDF strategy

`buildCombinedPdf` in [pdf.js](src/lib/pdf.js) dispatches between two paths based on whether `VITE_PDF_API_URL` is set at build time:

1. **Server-side via Gotenberg/LibreOffice** (when `VITE_PDF_API_URL` is set) — POSTs all `.docx` files (expanded by copies, filenames `0000.docx`, `0001.docx`… so merge order matches our explicit order) to `${VITE_PDF_API_URL}/forms/libreoffice/convert` with `merge=true`. Gotenberg returns a single combined PDF, rendered by real LibreOffice. Full Word fidelity — line shapes, multi-column sections, tab leaders, everything. This is the **recommended** production path. See [server/](server/) for the container + Cloud Run deploy.
2. **In-browser fallback** (when `VITE_PDF_API_URL` is empty) — renders every result off-screen via `docx-preview`, captures each page with `html2canvas`, and writes JPEGs into a `jsPDF` document. **Rasterized** (no searchable text) and lossy on column layouts and DrawingML shapes (see [render-transform.js](src/lib/render-transform.js) for partial workarounds). Kept so the app still works without a backend.

There's also [PrintView.jsx](src/components/PrintView.jsx) as a third option: renders all docs in a full-screen overlay with `page-break-after: always` and the user invokes the browser's print dialog ("Guardar como PDF"). It always uses docx-preview (no server call) since browser print is inherently client-side.

`docx-preview`, `html2canvas`, `jspdf`, and `xlsx` are all dynamic-imported so they don't bloat the initial bundle. When using the API path, `html2canvas`/`jspdf` chunks aren't even fetched.

## Known issues (TODO)

- **Multi-column section rendering in PDF** ([render-transform.js](src/lib/render-transform.js)): templates with `<w:cols w:num="2">` sections (typical 2-column signature blocks split by `<w:br w:type="column"/>`) are converted to a 2-cell table for PDF rendering, but in real-world `.docx` inputs the column-break detection still doesn't always place every paragraph in the correct cell — content can leak outside the table or land in the wrong column. The unit tests cover the simple case; real Word documents often have inline `<w:sectPr>` interleaved with paragraphs in ways the current regex-based approach mis-parses. Word and the downloaded `.docx` render correctly; only the PDF/Print preview path is affected.

## Tests

Vitest runs in node (no DOM needed for the lib functions tested). Tests live next to source as `*.test.js`. The `docx.js` tests build a minimal in-memory `.docx` (just a JSZip with `word/document.xml`) — no fixture files. The trickiest case to keep covered is the **run-split placeholder** (`<w:r><w:t>&lt;Foo</w:t></w:r><w:r><w:t>Bar&gt;</w:t></w:r>` → field name `FooBar`), since that's the regression risk if anyone simplifies the substitution loop.

## Deploy (GitHub Pages)

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) auto-deploys on push to `master` (lint → test → build → upload `dist/` → deploy). The Vite `base` is set to `/generadorDeContratosHP/` for production builds in [vite.config.js](vite.config.js); dev mode uses `/`. If the repo is renamed, update the `REPO` constant there.

One-time setup in GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The first push after enabling triggers the workflow; subsequent pushes update the site at `https://brunosilva9.github.io/generadorDeContratosHP/`.

## Origin

This web app replaces an older Excel VBA macro that drove Word via COM to do the same substitution. The legacy macros used real `<Field>` text replacement (Word's Find/Replace handled run-splitting natively), which is why the web port had to do the manual `&lt;...&gt;` scan with run-tag stripping.
