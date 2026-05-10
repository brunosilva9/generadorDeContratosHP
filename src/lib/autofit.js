import { fillTemplate } from './docx';

async function countPages(buffer) {
  const { renderAsync } = await import('docx-preview');
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    width: '21cm',
    background: '#fff',
  });
  document.body.appendChild(root);
  try {
    await renderAsync(buffer, root, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      experimental: true,
    });
    const sections = root.querySelectorAll('section.docx');
    return sections.length || 1;
  } finally {
    root.remove();
  }
}

// Renders the template with a sample row and compares page count to the
// original. Suggests a scale factor that brings the filled version back to the
// original page count. Clamped to [0.6, 1.0] in 5% steps.
export async function suggestScale(templateBuffer, sampleRow) {
  const [originalPages, filled] = await Promise.all([
    countPages(templateBuffer),
    fillTemplate(templateBuffer, sampleRow, { scale: 1 }),
  ]);
  const filledPages = await countPages(filled);
  if (filledPages <= originalPages) return { scale: 1, originalPages, filledPages };
  const ratio = originalPages / filledPages;
  const scale = Math.max(0.6, Math.round(ratio * 20) / 20);
  return { scale, originalPages, filledPages };
}
