import { CHILD_CONSENT_TEXT, CHILD_CONSENT_VERSION } from '@/types';

// Sanity tests for the POPIA consent constants - these are written into
// every family_members row that carries health data and stored long-term,
// so changes to the version string should be deliberate.

describe('CHILD_CONSENT_VERSION', () => {
  it('matches the YYYY-MM-tag-vN format', () => {
    expect(CHILD_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-[a-z]+-v\d+$/);
  });
});

describe('CHILD_CONSENT_TEXT', () => {
  it('mentions all the obligations the parent agrees to', () => {
    expect(CHILD_CONSENT_TEXT).toMatch(/consent/i);
    expect(CHILD_CONSENT_TEXT).toMatch(/health/i);
    expect(CHILD_CONSENT_TEXT).toMatch(/emergency/i);
    expect(CHILD_CONSENT_TEXT).toMatch(/(view|export).*delete/i);
    expect(CHILD_CONSENT_TEXT).toMatch(/18/);
  });

  it('is at least a paragraph (not a placeholder)', () => {
    expect(CHILD_CONSENT_TEXT.length).toBeGreaterThan(200);
  });
});
