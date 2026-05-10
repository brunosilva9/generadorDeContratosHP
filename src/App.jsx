import { useEffect, useState } from 'react';
import { UploadStep } from './components/UploadStep';
import { ConfigureStep } from './components/ConfigureStep';
import { GenerateStep } from './components/GenerateStep';
import { EMAIL_FIELD, generateEmail } from './lib/email';
import { loadState, saveState, clearState } from './lib/persistence';

const STEPS = [
  { id: 'upload', label: 'Subir archivos' },
  { id: 'configure', label: 'Configurar' },
  { id: 'generate', label: 'Generar' },
];

const DEFAULT_OPTIONS = { autoEmail: false };

function reshapeCopies(prev, rowCount, templateCount) {
  return Array.from({ length: rowCount }, (_, i) =>
    Array.from({ length: templateCount }, (_, j) => prev?.[i]?.[j] ?? 1)
  );
}

function buildAutoEmails(excel) {
  if (!excel || !excel.headers.includes(EMAIL_FIELD)) return {};
  const out = {};
  excel.rows.forEach((row, i) => {
    if (!String(row[EMAIL_FIELD] ?? '').trim()) {
      out[i] = generateEmail(row, excel.headers);
    }
  });
  return out;
}

export default function App() {
  const [stage, setStage] = useState('upload');
  const [excel, setExcel] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [copies, setCopies] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [autoEmails, setAutoEmails] = useState({});
  const [error, setError] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    loadState()
      .then((s) => {
        if (s) {
          setStage(s.stage ?? 'upload');
          setExcel(s.excel ?? null);
          setTemplates(s.templates ?? []);
          setCopies(s.copies ?? null);
          setOptions(s.options ?? DEFAULT_OPTIONS);
          setAutoEmails(s.autoEmails ?? {});
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      saveState({ stage, excel, templates, copies, options, autoEmails });
    }, 200);
    return () => clearTimeout(id);
  }, [hydrated, stage, excel, templates, copies, options, autoEmails]);

  const handleSetExcel = (next) => {
    setExcel(next);
    setAutoEmails(options.autoEmail ? buildAutoEmails(next) : {});
  };

  const handleSetOptions = (next) => {
    if (next.autoEmail && !options.autoEmail) {
      setAutoEmails(buildAutoEmails(excel));
    } else if (!next.autoEmail) {
      setAutoEmails({});
    }
    setOptions(next);
  };

  const regenerateEmail = (rowIdx) => {
    if (!excel) return;
    setAutoEmails((prev) => ({
      ...prev,
      [rowIdx]: generateEmail(excel.rows[rowIdx], excel.headers),
    }));
  };

  const goTo = (id) => {
    if (id === 'configure') {
      if (!excel || templates.length === 0) return;
      setCopies((prev) => reshapeCopies(prev, excel.rows.length, templates.length));
    }
    if (id === 'generate') {
      if (!copies || copies.every((row) => row.every((v) => v === 0))) return;
    }
    setStage(id);
  };

  const updateRows = (newRows) => setExcel((prev) => ({ ...prev, rows: newRows }));
  const updateTemplate = (idx, patch) =>
    setTemplates((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  const autoFitTemplate = async (idx) => {
    const t = templates[idx];
    if (!t?.buffer || !excel || excel.rows.length === 0) return;
    const { suggestScale } = await import('./lib/autofit');
    try {
      const { scale } = await suggestScale(t.buffer, excel.rows[0]);
      updateTemplate(idx, { scale });
    } catch (err) {
      console.warn('Auto-fit falló:', err);
    }
  };

  const reset = async () => {
    setStage('upload');
    setExcel(null);
    setTemplates([]);
    setCopies(null);
    setOptions(DEFAULT_OPTIONS);
    setAutoEmails({});
    setError(null);
    await clearState();
  };

  const currentIdx = STEPS.findIndex((s) => s.id === stage);
  const restoredButMissingTemplates =
    hydrated && excel && templates.length > 0 && templates.every((t) => !t.buffer);

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">
          <h1>Generador de Contratos</h1>
          <p>Excel + plantillas Word → documentos personalizados</p>
        </div>
        {stage !== 'upload' && (
          <button className="btn-link" onClick={reset}>Empezar de nuevo</button>
        )}
      </header>

      <nav className="stepper no-print" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            className={`stepper-item ${i === currentIdx ? 'active' : ''} ${i < currentIdx ? 'done' : ''}`}
            onClick={() => goTo(s.id)}
            disabled={i > currentIdx + 1}
          >
            <span className="stepper-num">{i + 1}</span>
            <span className="stepper-label">{s.label}</span>
          </button>
        ))}
      </nav>

      {restoredButMissingTemplates && (
        <div className="banner banner-warn no-print">
          Sesión restaurada, pero las plantillas <code>.docx</code> deben volver a subirse.
        </div>
      )}

      <main className="app-main no-print">
        {stage === 'upload' && (
          <UploadStep
            excel={excel}
            templates={templates}
            onExcel={handleSetExcel}
            onTemplates={setTemplates}
            onNext={() => goTo('configure')}
            error={error}
            setError={setError}
          />
        )}
        {stage === 'configure' && excel && templates.length > 0 && copies && (
          <ConfigureStep
            excel={excel}
            templates={templates}
            copies={copies}
            options={options}
            autoEmails={autoEmails}
            onRegenerateEmail={regenerateEmail}
            onUpdateRows={updateRows}
            onUpdateTemplate={updateTemplate}
            onAutoFit={autoFitTemplate}
            onCopies={setCopies}
            onOptions={handleSetOptions}
            onBack={() => goTo('upload')}
            onNext={() => goTo('generate')}
          />
        )}
        {stage === 'generate' && (
          <GenerateStep
            excel={excel}
            templates={templates}
            copies={copies}
            options={options}
            autoEmails={autoEmails}
            onBack={() => goTo('configure')}
          />
        )}
      </main>
    </div>
  );
}
