import { Actor } from '../../../core/auth/actor';
import {
  CompanyDirectory,
  PlatformRef,
  companyId,
  platformId,
} from '../../../core/context/scope.model';
import { ViewState } from '../../../core/state/view-state';
import { accountView } from './account-view';

const school: PlatformRef = {
  id: platformId('school'),
  name: 'Nawara School',
  key: 'nawara-school',
  product: 'school',
};
const drive: PlatformRef = {
  id: platformId('drive'),
  name: 'Nawara Drive',
  key: 'nawara-drive',
  product: 'drive',
};
const directory: ViewState<CompanyDirectory> = {
  status: 'success',
  data: { company: { id: companyId('c'), name: 'Nawara Solutions' }, platforms: [school, drive] },
};
const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'owner@x.invalid',
  displayName: 'Demo Owner',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [school.id, drive.id],
};
const phoneOperator: Actor = {
  kind: 'operator',
  userId: 'q',
  email: null,
  phone: '+99900000001',
  platformAssignments: [drive.id],
};
const idle: ViewState<never> = { status: 'idle' };

describe('accountView (P9-S2)', () => {
  it('is nothing without a session', () => {
    expect(accountView(null, directory, { status: 'success', data: [school] })).toEqual({
      kind: 'signedOut',
    });
  });

  it('an owner: their own contact and their Company, with no display name or other field invented', () => {
    const view = accountView(owner, directory, idle);
    expect(view).toEqual({
      kind: 'owner',
      contact: { email: 'owner@x.invalid', phone: null },
      company: { status: 'success', data: { name: 'Nawara Solutions', platformCount: 2 } },
    });
    // the demo display name and the user id are not account facts shown here
    expect(JSON.stringify(view)).not.toMatch(/Demo Owner|"o"/);
  });

  it('an owner whose Company cannot be read keeps that state (never a made-up name)', () => {
    const error: ViewState<CompanyDirectory> = {
      status: 'error',
      error: { kind: 'unavailable', status: 503 },
    };
    expect(accountView(owner, error, idle)).toMatchObject({ kind: 'owner', company: error });
    expect(accountView(owner, { status: 'loading' }, idle)).toMatchObject({
      company: { status: 'loading' },
    });
  });

  it('an operator: their own contact (phone-only too) and the Platforms they are granted now', () => {
    expect(accountView(operator, directory, { status: 'success', data: [school, drive] })).toEqual({
      kind: 'operator',
      contact: { email: 'p@x.invalid', phone: null },
      platforms: { status: 'success', data: [school, drive] },
    });
    expect(
      accountView(phoneOperator, directory, { status: 'success', data: [drive] }),
    ).toMatchObject({
      contact: { email: null, phone: '+99900000001' },
    });
  });

  it('never shows a Platform the operator is no longer granted, even from a list loaded before the refresh', () => {
    const revoked: Actor = { ...operator, platformAssignments: [drive.id] };
    expect(
      accountView(revoked, directory, { status: 'success', data: [school, drive] }),
    ).toMatchObject({
      platforms: { status: 'success', data: [drive] },
    });
    const none: Actor = { ...operator, platformAssignments: [] };
    expect(accountView(none, directory, { status: 'success', data: [school] })).toMatchObject({
      platforms: { status: 'empty' },
    });
  });

  it('never widens an operator beyond their grants: the Company directory is not their access', () => {
    const one: Actor = { ...operator, platformAssignments: [school.id] };
    const view = accountView(one, directory, { status: 'success', data: [school] });
    expect(view).toMatchObject({ platforms: { status: 'success', data: [school] } });
    expect(view).not.toHaveProperty('company');
  });

  it('an operator whose access cannot be read keeps the unavailable state, never an invented grant', () => {
    const error: ViewState<readonly PlatformRef[]> = {
      status: 'error',
      error: { kind: 'network', status: 0 },
    };
    expect(accountView(operator, directory, error)).toMatchObject({ platforms: error });
    expect(accountView(operator, directory, { status: 'forbidden' })).toMatchObject({
      platforms: { status: 'forbidden' },
    });
    expect(accountView(operator, directory, { status: 'loading' })).toMatchObject({
      platforms: { status: 'loading' },
    });
  });
});
