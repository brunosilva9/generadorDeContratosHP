import { useEffect, useMemo, useRef, useState } from 'react';

export function PrintView({ results, onClose }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('rendering'); // rendering | ready | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);

  const expanded = useMemo(() => {
    const out = [];
    for (const r of results) {
      const c = Math.max(1, r.copies ?? 1);
      for (let i = 0; i < c; i++) out.push({ ...r, copyIndex: i + 1 });
    }
    return out;
  }, [results]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    setProgress({ done: 0, total: expanded.length });

    (async () => {
      try {
        const [{ renderAsync }, { simplifyForRender }] = await Promise.all([
          import('docx-preview'),
          import('../lib/render-transform'),
        ]);
        for (let i = 0; i < expanded.length; i++) {
          if (cancelled) return;
          const item = expanded[i];

          const slot = document.createElement('div');
          slot.className = 'print-doc';
          container.appendChild(slot);

          const heading = document.createElement('h3');
          heading.className = 'print-doc-title';
          const copyTag = item.copies > 1 ? ` · copia ${item.copyIndex} / ${item.copies}` : '';
          heading.textContent = `${item.rowLabel} — ${item.templateName}${copyTag}`;
          slot.appendChild(heading);

          const body = document.createElement('div');
          slot.appendChild(body);

          const renderBuffer = await simplifyForRender(item.buffer);
          await renderAsync(renderBuffer, body, undefined, {
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            experimental: true,
          });
          if (cancelled) return;
          setProgress({ done: i + 1, total: expanded.length });
        }
        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded]);

  const handlePrint = () => window.print();

  return (
    <div className="print-overlay" role="dialog" aria-modal="true">
      <div className="print-toolbar no-print">
        <div>
          {status === 'rendering' && <span>Renderizando {progress.done} / {progress.total}…</span>}
          {status === 'ready' && <span>Listo · {expanded.length} {expanded.length === 1 ? 'documento' : 'documentos'}</span>}
          {status === 'error' && <span className="error-inline">Error: {error}</span>}
        </div>
        <div className="print-toolbar-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn-primary" onClick={handlePrint} disabled={status !== 'ready'}>
            🖨 Imprimir / Guardar PDF
          </button>
        </div>
      </div>
      <div className="print-root" ref={containerRef} />
    </div>
  );
}
