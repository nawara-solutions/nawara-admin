import { platformPath, scopeFromUrl } from './scope-context';
import { platformId } from './scope.model';

describe('scope from the URL (the URL is the source of truth, docs/ARCHITECTURE.md §7)', () => {
  it('treats company pages as company scope ("All platforms")', () => {
    expect(scopeFromUrl('/overview')).toEqual({ kind: 'company' });
    expect(scopeFromUrl('/')).toEqual({ kind: 'company' });
    expect(scopeFromUrl('/forbidden?x=1')).toEqual({ kind: 'company' });
  });

  it('reads the platform scope from /platforms/:platformId, ignoring query and fragment', () => {
    expect(scopeFromUrl('/platforms/abc-123')).toEqual({
      kind: 'platform',
      platformId: 'abc-123',
    });
    expect(scopeFromUrl('/platforms/abc-123/organizations?cursor=x#top')).toEqual({
      kind: 'platform',
      platformId: 'abc-123',
    });
  });

  it('does not invent a platform scope from /platforms alone', () => {
    expect(scopeFromUrl('/platforms')).toEqual({ kind: 'company' });
  });

  it('builds platform URLs that round-trip', () => {
    const id = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01');
    expect(scopeFromUrl(platformPath(id))).toEqual({ kind: 'platform', platformId: id });
  });
});
