import { Actor } from '../../../core/auth/actor';
import { companyId, platformId } from '../../../core/context/scope.model';
import { accountSettingsView } from './account-settings-view';

const owner: Actor = {
  kind: 'owner',
  userId: 'owner',
  companyId: companyId('company'),
  email: 'person@example.invalid',
};
const operator: Actor = {
  kind: 'operator',
  userId: 'operator',
  email: null,
  platformAssignments: [platformId('p')],
};
const loading = { status: 'loading' } as const;

describe('role-neutral account settings adapter', () => {
  it('has no data or actions without a session', () => {
    expect(accountSettingsView(null, loading, loading)).toBeNull();
  });
  it('preserves missing values without inferring a name or a phone', () => {
    const view = accountSettingsView(owner, loading, loading);
    expect(view?.profile.map((row) => row.value)).toEqual([null, owner.email, null]);
    expect(view?.securityLink).toBe(true);
    expect(view?.security.every((row) => row.value === null && row.status === 'not-reported')).toBe(
      true,
    );
    expect(view?.identity).toEqual({
      displayName: null,
      initials: null,
      email: owner.email,
      phone: null,
      roleKey: 'shell.role.owner',
    });
  });
  it('uses only actual supplied identity and never injects demo records', () => {
    const view = accountSettingsView(
      { ...owner, displayName: 'Actual supplied name' },
      loading,
      loading,
    );
    expect(view?.profile[0]?.value).toBe('Actual supplied name');
    expect(view?.identity.initials).toBe('AS');
    expect(view?.identity.displayName).toBe('Actual supplied name');
    expect(JSON.stringify(view)).not.toMatch(/Nawara Solutions|demo.nawara|Salim|password|enabled/);
  });
  it('never derives a name or initials from an email or phone', () => {
    for (const actor of [
      operator,
      { ...operator, email: 'someone.named@example.invalid' },
      { ...operator, phone: '+99900000001' },
    ]) {
      expect(accountSettingsView(actor, loading, loading)?.identity).toMatchObject({
        displayName: null,
        initials: null,
      });
    }
  });
  it('preserves real Unicode names and maps role data without granting security access', () => {
    const view = accountSettingsView({ ...operator, displayName: 'ليلى منصور' }, loading, loading);
    expect(view?.identity).toMatchObject({
      displayName: 'ليلى منصور',
      initials: 'لم',
      roleKey: 'shell.role.operator',
    });
    expect(view?.securityLink).toBe(false);
  });
  it('retains loading, empty, error and forbidden access states', () => {
    expect(accountSettingsView(owner, loading, loading)?.access.entries.status).toBe('loading');
    for (const state of [
      { status: 'empty' },
      { status: 'forbidden' },
      { status: 'error', error: { kind: 'network', status: 0 } },
    ] as const) {
      expect(accountSettingsView(operator, loading, state)?.access.entries).toEqual(state);
    }
    expect(
      accountSettingsView({ ...operator, platformAssignments: [] }, loading, loading)?.access
        .entries.status,
    ).toBe('empty');
  });
  it('filters stale access and preserves legitimate assignment ordering without creating memberships', () => {
    const view = accountSettingsView(operator, loading, {
      status: 'success',
      data: [
        { id: platformId('revoked'), name: 'Revoked', key: null, product: null },
        {
          id: platformId('p'),
          name: 'A very long authorized platform name '.repeat(15),
          key: null,
          product: null,
        },
      ],
    });
    expect(view?.access.entries).toMatchObject({ status: 'success', data: [{ id: 'p' }] });
    expect(view?.securityLink).toBe(false);
    expect(view?.access.rows).toHaveLength(2);
  });
});

it('maps company and platform scope separately from display labels', () => {
  expect(accountSettingsView(owner, loading, loading)?.access.rows).toContainEqual(
    expect.objectContaining({ id: 'scope', value: 'settings.account.ownerScope' }),
  );
  expect(accountSettingsView(operator, loading, loading)?.access.rows).toContainEqual(
    expect.objectContaining({ id: 'scope', value: 'settings.account.operatorScope' }),
  );
});

it('identifies Solutions only for the matching trusted company, never similar or unrelated names', () => {
  for (const [id, name, expected] of [
    ['company', 'Nawara Solutions', true],
    ['company', 'Another Company', false],
    ['company', 'Nawara Solutions International', false],
    ['unrelated', 'Nawara Solutions', false],
  ] as const) {
    const view = accountSettingsView(
      owner,
      {
        status: 'success',
        data: { company: { id: companyId(id), name }, platforms: [] },
      },
      loading,
    );
    const entries = view?.access.entries;
    expect(entries?.status).toBe('success');
    if (entries?.status === 'success') {
      expect(entries.data[0]?.brand).toBe(expected ? 'solutions' : undefined);
      expect(entries.data[0]?.name).toBe(name);
    }
  }
});
