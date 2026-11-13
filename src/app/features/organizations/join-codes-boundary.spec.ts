import { TestBed } from '@angular/core/testing';
import { Route, Routes } from '@angular/router';
import ar from '../../../i18n/ar.json';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import { appRoutes } from '../../app.routes';
import { StepUpPurpose } from '../../core/auth/step-up.gateway';
import { APP_ENVIRONMENT, AppEnvironment } from '../../core/config/app-environment';
import { allowsFactor, purposeRule } from '../../core/authorization/purpose-registry';
import { DEMO_BINDINGS } from '../../demo/demo-bindings';
import { demoWorldSeed } from '../../demo/world/seed';

/**
 * WP-4.4 Slice A. Join codes are not built in Admin (docs/ROADMAP.md: "Not built: … join codes"; seed-memberships.ts:
 * "Join codes themselves are not part of the demo world"). Core's `join_code.create` / `.revoke` purposes are recorded
 * as metadata only (WP-2.1). These tests keep that state honest until an approved design exists: no route, record,
 * copy or step-up purpose offers a join code, and no code value is held anywhere in the demo world.
 */
const NOW = Date.parse('2026-10-23T12:00:00Z');
/** Core's join-code format (`crypto/join-code.ts`, ADR-0029): 12 Crockford base-32 characters, `XXXX-XXXX-XXXX`. */
const JOIN_CODE = /\b[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}\b/;

const isRoutes = (value: unknown): value is Routes =>
  Array.isArray(value) && value.every((r) => typeof r === 'object' && r !== null);

/** Every path of the route tree, lazily loaded children included, resolved in an injection context. */
async function allPaths(routes: Routes, prefix = ''): Promise<string[]> {
  const found: string[] = [];
  for (const route of routes as readonly Route[]) {
    const path = `${prefix}/${route.path ?? ''}`.replace(/\/+/g, '/');
    found.push(path);
    if (route.children) found.push(...(await allPaths(route.children, path)));
    if (route.loadChildren) {
      const loader = route.loadChildren;
      const loaded: unknown = await TestBed.runInInjectionContext(() => loader());
      const resolved =
        typeof loaded === 'object' && loaded !== null && 'default' in loaded
          ? (loaded as { default: unknown }).default
          : loaded;
      if (isRoutes(resolved)) found.push(...(await allPaths(resolved, path)));
    }
  }
  return found;
}

/** Every key path of a translation file. */
const keysOf = (value: unknown, prefix = ''): string[] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([k, v]) => [`${prefix}${k}`, ...keysOf(v, `${prefix}${k}.`)])
    : [];

describe('Join codes boundary (WP-4.4 Slice A)', () => {
  it('no route offers join codes, in a demo build or a production one', async () => {
    for (const environment of [
      { production: false, demo: { load: async () => DEMO_BINDINGS } },
      { production: true, demo: null },
    ] satisfies AppEnvironment[]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: APP_ENVIRONMENT, useValue: environment }],
      });
      const paths = await allPaths(appRoutes(environment));
      expect(paths.length, String(environment.production)).toBeGreaterThan(10);
      expect(paths.filter((p) => /join/i.test(p))).toEqual([]);
    }
  });

  it('the demo world holds no join-code table and no code value in any record', () => {
    const world = demoWorldSeed(NOW);
    expect(Object.keys(world).filter((table) => /join/i.test(table))).toEqual([]);
    for (const [table, records] of Object.entries(world))
      expect(JSON.stringify(records), table).not.toMatch(JOIN_CODE);
  });

  it('memberships keep only Core’s opaque audience label, never a code or a code id', () => {
    const world = demoWorldSeed(NOW);
    for (const membership of world.memberships) {
      expect(
        Object.keys(membership).filter((k) => /code/i.test(k)),
        membership.id,
      ).toEqual([]);
    }
  });

  it('no screen copy names a join-code workflow, in English, French or Arabic', () => {
    for (const [lang, copy] of [
      ['en', en],
      ['fr', fr],
      ['ar', ar],
    ] as const)
      expect(
        keysOf(copy).filter((k) => /join_?code/i.test(k)),
        lang,
      ).toEqual([]);
  });

  it('Core’s join-code purposes stay metadata: recorded with Core’s factors, never an Admin step-up purpose', () => {
    // Recorded from Core (WP-2.1): any factor, the Auth-local header.
    for (const purpose of ['join_code.create', 'join_code.revoke'] as const) {
      expect(purposeRule(purpose).factors).toEqual(['totp', 'webauthn', 'secret_key']);
      expect(allowsFactor(purpose, 'secret_key')).toBe(true);
    }
    // Admin's own step-up purposes (what an action can ask for) do not include them.
    const adminPurposes: readonly StepUpPurpose[] = [
      'platform.create',
      'organization.create',
      'admin_invitation.create',
      'admin_invitation.revoke',
      'organization.admin.grant',
      'organization.admin.revoke',
      'platform_assignment.grant',
      'platform_assignment.revoke',
      'operator.create',
      'owner.factor.enroll',
      'owner.secret_key.rotate',
      'owner.factor.remove',
      'owner.password.change',
    ];
    // @ts-expect-error join codes are not an Admin step-up purpose: this must keep failing to compile.
    const joinCode: StepUpPurpose = 'join_code.create';
    expect(adminPurposes).not.toContain(joinCode);
  });
});
