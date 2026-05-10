import { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { generateAll, buildZip } from '../lib/generate';
import { PrintView } from './PrintView';

export function GenerateStep({ excel, templates, copies, options, autoEmails, onBack }) {
  const [status, setStatus] = useState('working'); // working | ready | zipping | pdf | error
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: 'docx' });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    generateAll(
      {
        rows: excel.rows,
        headers: excel.headers,
        templates,
        copies,
        autoEmail: options.autoEmail,
        autoEmails,
      },
      (p) => {
        if (!cancelled) setProgress({ ...p, phase: 'docx' });
      }
    )
      .then(({ results: r }) => {
        if (cancelled) return;
        setResults(r);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [excel, templates, copies, options.autoEmail, autoEmails]);

  const stamp = () => new Date().toISOString().slice(0, 10);

  const downloadZip = async () => {
    setStatus('zipping');
    setError(null);
    try {
      const blob = await buildZip(
        results,
        { pdfFileName: `Contratos_${stamp()}.pdf` },
        (p) => setProgress(p)
      );
      saveAs(blob, `Contratos_${stamp()}.zip`);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const downloadPdf = async () => {
    setStatus('pdf');
    setError(null);
    try {
      const { buildCombinedPdf } = await import('../lib/pdf');
      const blob = await buildCombinedPdf(results, (p) => setProgress({ ...p, phase: 'pdf' }));
      saveAs(blob, `Contratos_${stamp()}.pdf`);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const totalCopies = results?.reduce((s, r) => s + r.copies, 0) ?? 0;
  const percent = progress.total ? (progress.done / progress.total) * 100 : 0;
  const busy = status === 'working' || status === 'zipping' || status === 'pdf';

  const phaseLabel = () => {
    if (status === 'working') return `Generando documentos ${progress.done} / ${progress.total}…`;
    if (status === 'pdf') return `Renderizando PDF ${progress.done} / ${progress.total}…`;
    if (status === 'zipping') {
      if (progress.phase === 'pdf') return `Generando PDF ${progress.done} / ${progress.total}…`;
      if (progress.phase === 'zip') return 'Empaquetando ZIP…';
      return 'Empaquetando…';
    }
    return null;
  };

  return (
    <div className="step">
      <section className="card">
        <header className="card-header">
          <h2>Generación</h2>
          {busy && <p className="muted">{phaseLabel()}</p>}
          {status === 'ready' && results && (
            <p className="muted">
              {results.length} {results.length === 1 ? 'archivo único' : 'archivos únicos'} en ZIP · {totalCopies} {totalCopies === 1 ? 'copia' : 'copias'} en el PDF
            </p>
          )}
          {status === 'error' && <p className="muted">Error</p>}
        </header>

        {busy && (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${percent}%` }} />
          </div>
        )}

        {status === 'error' && <div className="error">{error}</div>}

        {results && (
          <div className="result-actions">
            <button className="btn-primary" onClick={downloadZip} disabled={busy}>
              ⬇ Descargar ZIP <span className="btn-sub">.docx por persona + PDF combinado</span>
            </button>
            <button className="btn-secondary" onClick={downloadPdf} disabled={busy}>
              ⬇ Solo PDF <span className="btn-sub">con copias, para imprimir</span>
            </button>
            <button className="btn-secondary" onClick={() => setShowPrint(true)} disabled={busy}>
              🖨 Vista previa
            </button>
          </div>
        )}
      </section>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack} disabled={busy}>← Atrás</button>
      </div>

      {showPrint && results && (
        <PrintView results={results} onClose={() => setShowPrint(false)} />
      )}
    </div>
  );
}
