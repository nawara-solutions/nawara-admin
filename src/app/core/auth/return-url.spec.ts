import { isSignInReason, safeReturnUrl } from './return-url';

describe('safeReturnUrl (open-redirect protection)', () => {
  it('keeps internal, path-only Admin routes', () => {
    expect(safeReturnUrl('/overview')).toBe('/overview');
    expect(safeReturnUrl('/platforms/5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01')).toBe(
      '/platforms/5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01',
    );
  });

  it.each([
    ['another site', 'https://evil.example/overview'],
    ['a protocol-relative host', '//evil.example'],
    ['a backslash host', '/\\evil.example'],
    ['a script URL', 'javascript:alert(1)'],
    ['a relative path', 'overview'],
    ['a query string', '/overview?x=1'],
    ['a fragment', '/overview#top'],
    ['the root', '/'],
    ['the sign-in page', '/login'],
    ['a sign-in step', '/login/verify'],
    ['a non-string', 42],
    ['an oversized value', `/${'a'.repeat(600)}`],
  ])('drops %s', (_label, value) => {
    expect(safeReturnUrl(value)).toBeNull();
  });
});

describe('isSignInReason', () => {
  it('accepts only the known machine values', () => {
    expect(isSignInReason('signed-out')).toBe(true);
    expect(isSignInReason('Signed out')).toBe(false);
    expect(isSignInReason(null)).toBe(false);
  });
});
