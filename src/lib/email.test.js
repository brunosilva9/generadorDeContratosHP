import { describe, it, expect } from 'vitest';
import { generateEmail, isValidEmail, applyAutoEmails, EMAIL_FIELD } from './email';

describe('isValidEmail', () => {
  it('accepts well-formed emails', () => {
    expect(isValidEmail('a@b.cc')).toBe(true);
    expect(isValidEmail('foo.bar.xy@gmail.com')).toBe(true);
  });

  it('rejects malformed', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('foo')).toBe(false);
    expect(isValidEmail('foo@bar')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

describe('generateEmail', () => {
  it('uses Nombre and Apellido columns when present', () => {
    const email = generateEmail({ Nombre: 'Bruno', Apellido: 'Silva' }, ['Nombre', 'Apellido']);
    expect(email).toMatch(/^bruno\.silva\.[a-z0-9]{2,4}@gmail\.com$/);
  });

  it('strips diacritics', () => {
    const email = generateEmail({ Nombre: 'José', Apellido: 'Núñez' }, ['Nombre', 'Apellido']);
    expect(email).toMatch(/^jose\.nunez\./);
  });

  it('falls back to splitting first column when no Nombre/Apellido headers', () => {
    const email = generateEmail({ NombreCompleto: 'Bruno Ignacio Silva' }, ['NombreCompleto']);
    expect(email).toMatch(/^bruno\.silva\./);
  });

  it('always ends in @gmail.com', () => {
    const email = generateEmail({ Nombre: 'X', Apellido: 'Y' }, ['Nombre', 'Apellido']);
    expect(email.endsWith('@gmail.com')).toBe(true);
  });
});

describe('applyAutoEmails', () => {
  it('preserves rows that already have a non-empty email', () => {
    const headers = ['Nombre', EMAIL_FIELD];
    const rows = [
      { Nombre: 'A', [EMAIL_FIELD]: 'a@b.com' },
      { Nombre: 'B', [EMAIL_FIELD]: '' },
    ];
    const out = applyAutoEmails(rows, headers);
    expect(out[0][EMAIL_FIELD]).toBe('a@b.com');
    expect(out[1][EMAIL_FIELD]).toMatch(/@gmail\.com$/);
  });

  it('uses precomputed emails when provided', () => {
    const headers = ['Nombre', EMAIL_FIELD];
    const rows = [{ Nombre: 'A', [EMAIL_FIELD]: '' }];
    const out = applyAutoEmails(rows, headers, { 0: 'cached@gmail.com' });
    expect(out[0][EMAIL_FIELD]).toBe('cached@gmail.com');
  });

  it('returns input unchanged when EMAIL_FIELD is not in headers', () => {
    const out = applyAutoEmails([{ A: 'x' }], ['A']);
    expect(out[0]).toEqual({ A: 'x' });
  });
});
