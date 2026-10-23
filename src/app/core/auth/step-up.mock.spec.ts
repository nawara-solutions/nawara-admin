import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { NW_CLOCK } from '../../shared/format/clock';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import { DemoAuthState } from './auth.mock-state';
import {
  DEMO_STEP_UP_LIFETIME_MS,
  MockStepUpGateway,
  STEP_UP_DEMO_SCENARIO,
  StepUpDemoScenario,
} from './step-up.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');

function setUp(tier: 'owner' | 'operator' | null, scenario: StepUpDemoScenario = 'normal') {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: STEP_UP_DEMO_SCENARIO, useValue: scenario },
      MockStepUpGateway,
    ],
  });
  const state = TestBed.inject(DemoAuthState);
  if (tier !== null)
    state.signedIn.set({
      identity: { userId: tier, email: null, phone: null, adminTier: tier },
      businessIdentityId: null,
    });
  return { gateway: TestBed.inject(MockStepUpGateway), state };
}

async function error(answer: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockStepUpGateway (simulated; never a Core token)', () => {
  it('issues the owner an opaque grant for the demo code, valid for five minutes', async () => {
    const { gateway } = setUp('owner');
    const grant = await firstValueFrom(
      gateway.obtain('platform.create', { method: 'totp', code: '123 456' }),
    );
    expect(grant.token).toMatch(/^demo-step-up-[0-9a-f-]{36}$/);
    expect(grant.expiresAt).toBe(new Date(NOW + DEMO_STEP_UP_LIFETIME_MS).toISOString());
  });

  it('refuses a wrong code, an operator, and nobody signed in', async () => {
    expect(
      (
        await error(
          setUp('owner').gateway.obtain('platform.create', { method: 'totp', code: '000000' }),
        )
      ).status,
    ).toBe(401);
    TestBed.resetTestingModule();
    expect(
      await error(
        setUp('operator').gateway.obtain('platform.create', { method: 'totp', code: '123456' }),
      ),
    ).toMatchObject({
      status: 403,
      code: 'admin_forbidden',
    });
    TestBed.resetTestingModule();
    expect(
      (
        await error(
          setUp(null).gateway.obtain('platform.create', { method: 'totp', code: '123456' }),
        )
      ).status,
    ).toBe(401);
  });

  it('simulates a rate limit and an outage', async () => {
    expect(
      await error(
        setUp('owner', 'rateLimited').gateway.obtain('platform.create', {
          method: 'totp',
          code: '123456',
        }),
      ),
    ).toMatchObject({ status: 429, retryAfterSeconds: 30 });
    TestBed.resetTestingModule();
    expect(
      (
        await error(
          setUp('owner', 'unavailable').gateway.obtain('platform.create', {
            method: 'totp',
            code: '123456',
          }),
        )
      ).status,
    ).toBe(503);
  });

  it('accepts a grant once, for its purpose and user only, before it expires', async () => {
    const { gateway, state } = setUp('owner');
    const issue = async () =>
      (await firstValueFrom(gateway.obtain('platform.create', { method: 'totp', code: '123456' })))
        .token;
    const once = await issue();
    expect(state.consumeStepUp(once, 'platform.create', 'owner', NOW)).toBe(true);
    expect(state.consumeStepUp(once, 'platform.create', 'owner', NOW)).toBe(false);
    const otherPurpose = await issue();
    expect(state.consumeStepUp(otherPurpose, 'operator.create', 'owner', NOW)).toBe(false);
    // A refused attempt still uses the grant up.
    expect(state.consumeStepUp(otherPurpose, 'platform.create', 'owner', NOW)).toBe(false);
    const otherUser = await issue();
    expect(state.consumeStepUp(otherUser, 'platform.create', 'someone-else', NOW)).toBe(false);
    const expired = await issue();
    expect(
      state.consumeStepUp(expired, 'platform.create', 'owner', NOW + DEMO_STEP_UP_LIFETIME_MS),
    ).toBe(false);
    expect(state.consumeStepUp(null, 'platform.create', 'owner', NOW)).toBe(false);
  });

  it('records the factor: a passkey or TOTP grant serves an invitation purpose, a secret-key one never does', async () => {
    const { gateway, state } = setUp('owner');
    const passkey = (
      await firstValueFrom(
        gateway.obtain('admin_invitation.create', {
          method: 'passkey',
          assertion: { credential: 'simulated-assertion' },
        }),
      )
    ).token;
    expect(state.checkStepUp(passkey, 'admin_invitation.create', 'owner', NOW)).toBe(true);
    const key = state.issueStepUp('admin_invitation.revoke', 'owner', NOW + 60_000, 'secret_key');
    expect(state.checkStepUp(key, 'admin_invitation.revoke', 'owner', NOW)).toBe(false);
    expect(state.consumeStepUp(key, 'admin_invitation.revoke', 'owner', NOW)).toBe(false);
    // The secret key still serves a purpose that accepts it.
    const platform = state.issueStepUp('platform.create', 'owner', NOW + 60_000, 'secret_key');
    expect(state.consumeStepUp(platform, 'platform.create', 'owner', NOW)).toBe(true);
  });

  it('checks a grant without consuming it (a command spends it only when its change commits)', () => {
    const { state } = setUp('owner');
    const token = state.issueStepUp('admin_invitation.create', 'owner', NOW + 60_000);
    expect(state.checkStepUp(token, 'admin_invitation.create', 'owner', NOW)).toBe(true);
    expect(state.checkStepUp(token, 'admin_invitation.create', 'owner', NOW)).toBe(true);
    expect(state.checkStepUp(token, 'admin_invitation.revoke', 'owner', NOW)).toBe(false);
    expect(state.checkStepUp(token, 'admin_invitation.create', 'someone', NOW)).toBe(false);
    expect(state.checkStepUp(token, 'admin_invitation.create', 'owner', NOW + 60_000)).toBe(false);
    expect(state.consumeStepUp(token, 'admin_invitation.create', 'owner', NOW)).toBe(true);
    expect(state.checkStepUp(token, 'admin_invitation.create', 'owner', NOW)).toBe(false);
  });
});
