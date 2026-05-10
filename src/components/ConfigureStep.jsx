import { useMemo } from 'react';
import { EMAIL_FIELD, isValidEmail } from '../lib/email';

export function ConfigureStep({
  excel,
  templates,
  copies,
  options,
  autoEmails,
  onRegenerateEmail,
  onUpdateRows,
  onUpdateTemplate,
  onAutoFit,
  onCopies,
  onOptions,
  onBack,
  onNext,
}) {
  const totalDocs = useMemo(
    () => copies.reduce((sum, row) => sum + row.reduce((a, b) => a + Math.max(0, b), 0), 0),
    [copies]
  );

  const hasEmailField = excel.headers.includes(EMAIL_FIELD);
  const missingEmailCount = useMemo(() => {
    if (!hasEmailField) return 0;
    return excel.rows.filter((r) => !String(r[EMAIL_FIELD] ?? '').trim()).length;
  }, [excel, hasEmailField]);

  const setCell = (rowIdx, tplIdx, value) => {
    const v = Math.max(0, Math.min(99, Number.isFinite(+value) ? +value : 0));
    const next = copies.map((r) => [...r]);
    next[rowIdx][tplIdx] = v;
    onCopies(next);
  };

  const setAll = (value) => onCopies(copies.map((r) => r.map(() => value)));
  const setColumn = (tplIdx, value) =>
    onCopies(copies.map((r) => r.map((c, j) => (j === tplIdx ? value : c))));
  const setRow = (rowIdx, value) =>
    onCopies(copies.map((r, i) => (i === rowIdx ? r.map(() => value) : r)));

  const updateCell = (rowIdx, header, value) => {
    const next = excel.rows.map((r, i) => (i === rowIdx ? { ...r, [header]: value } : r));
    onUpdateRows(next);
  };

  const updateScale = (tplIdx, percent) => {
    const clamped = Math.max(50, Math.min(150, Number.isFinite(+percent) ? +percent : 100));
    onUpdateTemplate(tplIdx, { scale: clamped / 100 });
  };

  return (
    <div className="step">
      <section className="card">
        <header className="card-header">
          <h2>Datos · {excel.rows.length} {excel.rows.length === 1 ? 'fila' : 'filas'}</h2>
          <p className="muted">Editá cualquier celda si hay un valor mal escrito.</p>
        </header>
        <div className="table-wrap data-edit">
          <table>
            <thead>
              <tr>
                <th className="row-num">#</th>
                {excel.headers.map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {excel.rows.map((row, i) => (
                <tr key={i}>
                  <td className="row-num">{i + 1}</td>
                  {excel.headers.map((h) => {
                    const value = row[h] ?? '';
                    const isEmail = h === EMAIL_FIELD;
                    const invalid = isEmail && value.trim() && !isValidEmail(value);
                    const showAutoPreview = isEmail && !value.trim() && options.autoEmail;
                    return (
                      <td key={h} className={`cell-edit ${invalid ? 'cell-invalid' : ''} ${showAutoPreview ? 'cell-auto' : ''}`}>
                        <div className="cell-edit-inner">
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => updateCell(i, h, e.target.value)}
                            placeholder={showAutoPreview ? autoEmails?.[i] ?? 'auto-generado' : ''}
                            title={invalid ? 'Email con formato inválido' : undefined}
                          />
                          {showAutoPreview && (
                            <button
                              type="button"
                              className="btn-regenerate"
                              onClick={() => onRegenerateEmail(i)}
                              title="Regenerar correo"
                              aria-label="Regenerar correo"
                            >↻</button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Opciones</h2>
        </header>

        <label className={`option ${!hasEmailField ? 'option-disabled' : ''}`}>
          <input
            type="checkbox"
            checked={options.autoEmail}
            disabled={!hasEmailField}
            onChange={(e) => onOptions({ ...options, autoEmail: e.target.checked })}
          />
          <span>
            <strong>Generar correos automáticamente</strong>
            <span className="muted">
              {hasEmailField
                ? ` Rellena ${missingEmailCount} ${missingEmailCount === 1 ? 'celda vacía' : 'celdas vacías'} de ${EMAIL_FIELD} con formato nombre.apellido.suffix@gmail.com`
                : ` (no hay columna ${EMAIL_FIELD} en el Excel)`}
            </span>
          </span>
        </label>

      </section>

      <section className="card">
        <header className="card-header">
          <h2>Copias y escala</h2>
          <p className="muted">El ZIP incluye 1 archivo por (persona × plantilla). Las copias solo afectan al PDF. <strong>Total copias: {totalDocs}</strong></p>
        </header>

        <div className="quick-actions">
          <span>Aplicar copias a todos:</span>
          <button className="btn-chip" onClick={() => setAll(0)}>0</button>
          <button className="btn-chip" onClick={() => setAll(1)}>1</button>
          <button className="btn-chip" onClick={() => setAll(2)}>2</button>
          <button className="btn-chip" onClick={() => setAll(3)}>3</button>
        </div>

        <div className="table-wrap">
          <table className="copies-matrix">
            <thead>
              <tr>
                <th className="row-label">Persona</th>
                {templates.map((t, j) => (
                  <th key={t.name}>
                    <div className="th-stack">
                      <span title={t.name}>{shortName(t.name)}</span>
                      <div className="scale-row">
                        <label className="scale-input" title="Escala de fuentes / spacing / márgenes (%)">
                          <input
                            type="number"
                            min={50}
                            max={150}
                            step={5}
                            value={Math.round((t.scale ?? 1) * 100)}
                            onChange={(e) => updateScale(j, e.target.value)}
                          />
                          <span>%</span>
                        </label>
                        <button
                          className="btn-chip-mini"
                          onClick={() => onAutoFit?.(j)}
                          title="Calcular escala automática para mantener el número de páginas"
                        >auto</button>
                      </div>
                      <div className="col-quick">
                        <button className="btn-chip-mini" onClick={() => setColumn(j, 0)}>0</button>
                        <button className="btn-chip-mini" onClick={() => setColumn(j, 1)}>1</button>
                      </div>
                    </div>
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {excel.rows.map((row, i) => {
                const rowTotal = copies[i].reduce((a, b) => a + b, 0);
                return (
                  <tr key={i}>
                    <td className="row-label">
                      <strong>{row[excel.headers[0]] || `Fila ${i + 1}`}</strong>
                      <div className="col-quick">
                        <button className="btn-chip-mini" onClick={() => setRow(i, 0)}>0</button>
                        <button className="btn-chip-mini" onClick={() => setRow(i, 1)}>1</button>
                      </div>
                    </td>
                    {templates.map((t, j) => (
                      <td key={t.name} className="cell-input">
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={copies[i][j]}
                          onChange={(e) => setCell(i, j, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="row-total">{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Atrás</button>
        <button className="btn-primary" disabled={totalDocs === 0} onClick={onNext}>
          Generar {totalDocs} {totalDocs === 1 ? 'documento' : 'documentos'} →
        </button>
      </div>
    </div>
  );
}

function shortName(name) {
  return name.replace(/\.docx$/i, '');
}
