import { useMemo, useRef } from 'react';
import { parseExcel } from '../lib/excel';
import { extractPlaceholders } from '../lib/docx';

export function UploadStep({ excel, templates, onExcel, onTemplates, onNext, error, setError }) {
  const excelInput = useRef(null);
  const tplInput = useRef(null);

  const handleExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = await parseExcel(file);
      onExcel({ ...parsed, fileName: file.name });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTemplates = async (e) => {
    const files = [...e.target.files].filter((f) => f.name.toLowerCase().endsWith('.docx'));
    if (files.length === 0) return;
    const loaded = await Promise.all(
      files.map(async (f) => {
        const buffer = await f.arrayBuffer();
        const placeholders = await extractPlaceholders(buffer);
        return { name: f.name, buffer, scale: 1, placeholders };
      })
    );
    const merged = dedupeByName([...templates, ...loaded]);
    onTemplates(merged);
  };

  const removeTemplate = (idx) => {
    onTemplates(templates.filter((_, i) => i !== idx));
  };

  const validation = useMemo(() => {
    if (!excel || templates.length === 0) return null;
    const headers = new Set(excel.headers);
    const allPlaceholders = new Set();
    const missingByTemplate = templates.map((t) => {
      const missing = (t.placeholders ?? []).filter((p) => !headers.has(p));
      (t.placeholders ?? []).forEach((p) => allPlaceholders.add(p));
      return { name: t.name, missing, count: t.placeholders?.length ?? 0 };
    });
    const unusedHeaders = excel.headers.filter((h) => !allPlaceholders.has(h));
    return { missingByTemplate, unusedHeaders };
  }, [excel, templates]);

  const ready = excel && templates.length > 0;

  return (
    <div className="step">
      <section className="card">
        <header className="card-header">
          <h2>1. Datos (Excel)</h2>
          <p className="muted">Una hoja llamada <code>Datos</code> (o la primera). Fila 1 = encabezados con nombres de campo.</p>
        </header>

        <button className="btn-secondary" onClick={() => excelInput.current?.click()}>
          {excel ? 'Cambiar Excel' : 'Seleccionar archivo'}
        </button>
        <input
          ref={excelInput}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          onChange={handleExcel}
          hidden
        />

        {excel && (
          <div className="pill pill-success">
            <strong>{excel.fileName}</strong> · {excel.rows.length} filas · {excel.headers.length} campos · hoja <em>{excel.sheetName}</em>
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2>2. Plantillas (Word)</h2>
          <p className="muted">Una o más <code>.docx</code>. Cada placeholder <code>&lt;Campo&gt;</code> se reemplaza por la columna correspondiente.</p>
        </header>

        <button className="btn-secondary" onClick={() => tplInput.current?.click()}>
          Agregar plantillas
        </button>
        <input
          ref={tplInput}
          type="file"
          accept=".docx"
          multiple
          onChange={handleTemplates}
          hidden
        />

        {templates.length > 0 && (
          <ul className="template-list">
            {templates.map((t, i) => (
              <li key={t.name}>
                <div className="template-info">
                  <span className="template-name">{t.name}</span>
                  <span className="muted">
                    {t.placeholders?.length ?? 0} {t.placeholders?.length === 1 ? 'campo' : 'campos'}
                    {t.placeholders?.length > 0 && `: ${t.placeholders.slice(0, 6).join(', ')}${t.placeholders.length > 6 ? '…' : ''}`}
                  </span>
                </div>
                <button className="btn-link" onClick={() => removeTemplate(i)} aria-label={`Quitar ${t.name}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {validation && (
        <ValidationCard validation={validation} />
      )}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="btn-primary" disabled={!ready} onClick={onNext}>
          Siguiente →
        </button>
      </div>
    </div>
  );
}

function dedupeByName(list) {
  const seen = new Map();
  for (const item of list) seen.set(item.name, item);
  return [...seen.values()];
}

function ValidationCard({ validation }) {
  const { missingByTemplate, unusedHeaders } = validation;
  const hasMissing = missingByTemplate.some((t) => t.missing.length > 0);

  return (
    <section className="card validation">
      <header className="card-header">
        <h2>Validación de campos</h2>
        <p className="muted">
          {hasMissing
            ? 'Algunos placeholders no tienen columna en el Excel. Quedarán sin reemplazar.'
            : 'Todos los placeholders tienen su columna correspondiente.'}
        </p>
      </header>

      <ul className="validation-list">
        {missingByTemplate.map((t) => (
          <li key={t.name} className={t.missing.length > 0 ? 'has-issue' : ''}>
            <strong>{t.name}</strong>
            {t.missing.length === 0 ? (
              <span className="ok">✓ {t.count} {t.count === 1 ? 'campo OK' : 'campos OK'}</span>
            ) : (
              <span className="warn">
                ⚠ Falta{t.missing.length === 1 ? '' : 'n'}: {t.missing.join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>

      {unusedHeaders.length > 0 && (
        <p className="muted small">
          Columnas del Excel sin uso en plantillas: {unusedHeaders.join(', ')}
        </p>
      )}
    </section>
  );
}
