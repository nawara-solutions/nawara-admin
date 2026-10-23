import { draftProblems } from './create-organization.model';
import {
  OrganizationValues,
  draftOf,
  fieldChange,
  isEmptyPatch,
  patchFrom,
  rebaseDraft,
} from './edit-organization.model';

const original: OrganizationValues = {
  name: 'École Al Fajr',
  taxCode: null,
  address: '12 Rue des Écoles',
  phone: '+213 21 00 00',
  type: 'School',
};

describe('editing an Organization (pure rules)', () => {
  it('starts from the loaded values, an unset field as empty text', () => {
    expect(draftOf(original)).toEqual({
      name: 'École Al Fajr',
      taxCode: '',
      address: '12 Rue des Écoles',
      phone: '+213 21 00 00',
      type: 'School',
    });
    expect(isEmptyPatch(patchFrom(original, draftOf(original)))).toBe(true);
  });

  it('treats a whitespace-only edit as no change', () => {
    const draft = {
      ...draftOf(original),
      name: '  École Al Fajr ',
      type: 'School  ',
      taxCode: '   ',
    };
    expect(patchFrom(original, draft)).toEqual({});
    expect(fieldChange(original, draft, 'taxCode')).toBe('unchanged');
  });

  it('sends only the changed fields: trimmed text, and null for a cleared optional field', () => {
    const draft = {
      ...draftOf(original),
      name: ' École Al Fajr – Annexe ',
      phone: '',
      taxCode: 'TX-1',
    };
    expect(patchFrom(original, draft)).toEqual({
      name: 'École Al Fajr – Annexe',
      phone: null,
      taxCode: 'TX-1',
    });
    expect(fieldChange(original, draft, 'name')).toBe('changed');
    expect(fieldChange(original, draft, 'phone')).toBe('removed');
    expect(fieldChange(original, draft, 'taxCode')).toBe('changed');
    expect(fieldChange(original, draft, 'address')).toBe('unchanged');
  });

  it('never clears the name: a blank name is a change the form refuses', () => {
    const draft = { ...draftOf(original), name: '   ' };
    expect(fieldChange(original, draft, 'name')).toBe('changed');
    expect(patchFrom(original, draft)).toEqual({ name: '' });
    expect(draftProblems(draft).name).toBe('required');
  });

  it('rebases a draft onto newer values: untouched fields follow them, the person’s own changes stay', () => {
    const draft = { ...draftOf(original), type: 'Secondary school', phone: '' };
    const current = { ...original, name: 'Renamed elsewhere', type: 'Secondary school' };
    const rebased = rebaseDraft(original, current, draft);
    expect(rebased.name).toBe('Renamed elsewhere');
    // The type change is already applied, the phone removal is still pending.
    expect(patchFrom(current, rebased)).toEqual({ phone: null });
  });

  it('never puts an immutable field in the patch', () => {
    const patch = patchFrom(original, { ...draftOf(original), name: 'X' });
    for (const key of ['id', 'platformId', 'createdAt', 'updatedAt'])
      expect(key in patch).toBe(false);
  });
});
