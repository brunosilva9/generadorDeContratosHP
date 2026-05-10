export const EMAIL_FIELD = 'EMAILTRABAJADOR';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s) {
  return EMAIL_RE.test(String(s ?? '').trim());
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const DIACRITICS = /[̀-ͯ]/g;

function randomLetters(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * 26)];
  return s;
}

function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

const SUFFIX_GENERATORS = [
  () => randomLetters(2),
  () => randomDigits(2),
  () => randomDigits(3),
  () => randomDigits(4),
];

function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z]+/g, '');
}

function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '');
}

export function detectNameColumns(headers) {
  const lower = headers.map(normalize);
  const nombreIdx = lower.findIndex((h) => /(^|[^a-z])nombre([^a-z]|$)/.test(h) && !/apellido/.test(h));
  const apellidoIdx = lower.findIndex((h) => /apellido/.test(h));
  return { nombreIdx, apellidoIdx };
}

export function generateEmail(row, headers) {
  const { nombreIdx, apellidoIdx } = detectNameColumns(headers);
  let nombre = nombreIdx >= 0 ? row[headers[nombreIdx]] : '';
  let apellido = apellidoIdx >= 0 ? row[headers[apellidoIdx]] : '';

  if (!nombre || !apellido) {
    const first = String(row[headers[0]] ?? '').trim();
    const parts = first.split(/[\s_\-.]+/).filter(Boolean);
    if (parts.length >= 2) {
      nombre = nombre || parts[0];
      apellido = apellido || parts[parts.length - 1];
    } else if (parts.length === 1) {
      nombre = nombre || parts[0];
      apellido = apellido || parts[0];
    }
  }

  const n = slugify(nombre) || 'usuario';
  const a = slugify(apellido) || 'correo';
  const suffix = SUFFIX_GENERATORS[Math.floor(Math.random() * SUFFIX_GENERATORS.length)]();
  return `${n}.${a}.${suffix}@gmail.com`;
}

export function applyAutoEmails(rows, headers, precomputed = {}) {
  if (!headers.includes(EMAIL_FIELD)) return rows;
  return rows.map((row, i) => {
    const current = row[EMAIL_FIELD];
    if (current && String(current).trim()) return row;
    const email = precomputed[i] ?? generateEmail(row, headers);
    return { ...row, [EMAIL_FIELD]: email };
  });
}
