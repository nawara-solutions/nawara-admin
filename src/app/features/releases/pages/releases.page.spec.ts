import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { ReleasesFacade } from '../application/releases.facade';
import {
  ReleaseInformationGateway,
  UnavailableReleaseInformationGateway,
} from '../data-access/release-information.gateway';
import {
  MockReleaseInformationGateway,
  RELEASES_DEMO_SCENARIO,
  ReleasesDemoScenario,
} from '../data-access/release-information.mock';
import { ReleasesPage } from './releases.page';

const t = en.releases;

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};

async function render(
  actor: Actor = owner,
  {
    gateway = 'mock',
    scenario = 'normal',
  }: { gateway?: 'mock' | 'unavailable'; scenario?: ReleasesDemoScenario } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      ReleasesPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: RELEASES_DEMO_SCENARIO, useValue: scenario },
      {
        provide: ReleaseInformationGateway,
        useClass:
          gateway === 'mock' ? MockReleaseInformationGateway : UnavailableReleaseInformationGateway,
      },
      ReleasesFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const spy = vi.spyOn(TestBed.inject(ReleaseInformationGateway), 'information');
  const fixture = TestBed.createComponent(ReleasesPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async (ms = 10) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  for (
    let i = 0;
    i < 20 && !element.querySelector('nw-data-state:not([state="loading"]), [data-capability]');
    i++
  )
    await settle();
  await settle();
  return { element, spy, settle };
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Releases information page (P8-S4)', { timeout: 15_000 }, () => {
  it('explains the Release service and how each capability stands for Admin', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.header.title);
    expect(text(element.querySelector('[data-not-catalog]'))).toBe(t.notCatalog);
    expect(text(element.querySelector('#releases-service')?.parentElement)).toContain(
      en.coreServices.services.release.owns,
    );
    const entries = [...element.querySelectorAll('[data-capability]')].map((d) => [
      d.getAttribute('data-capability'),
      text(d.querySelector('dt')),
      text(d.querySelector('.releases__status')),
    ]);
    expect(entries).toEqual([
      ['catalog', t.capability.catalog.title, t.status.notAvailable],
      ['publish', t.capability.publish.title, t.status.ciOnly],
      ['withdraw', t.capability.withdraw.title, t.status.notInAdmin],
      ['minimumVersion', t.capability.minimumVersion.title, t.status.notInAdmin],
    ]);
    expect([...element.querySelectorAll('[data-before] li')].map((li) => text(li))).toEqual([
      t.before.catalog,
      t.before.contract,
      t.before.authorization,
    ]);
  });

  it('lists no release, version, deployment or URL, and offers no control, enabled or disabled', async () => {
    const { element } = await render();
    expect(
      element.querySelectorAll('button, a, input, select, form, [role="dialog"], [aria-disabled]'),
    ).toHaveLength(0);
    expect(element.textContent).not.toMatch(
      /\bv?\d+\.\d+(\.\d+)?\b|https?:\/\/|\.apk|\.ipa|\b(deployed|rolled back)\b/i,
    );
    expect(element.querySelectorAll('table, ol, time')).toHaveLength(0);
  });

  it('loads once and makes no network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { spy, settle } = await render();
    await settle(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('never asks an operator’s gateway, whatever their Platform assignments', async () => {
    const { element, spy } = await render(operator);
    expect(spy).not.toHaveBeenCalled();
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('[data-capability]')).toBeNull();
  });

  it('says it is not available in a build without the mock, and offers a retry after an error', async () => {
    const unavailable = await render(owner, { gateway: 'unavailable' });
    expect(text(unavailable.element.querySelector('nw-data-state'))).toContain(
      t.states.notInBuildTitle,
    );
    expect(unavailable.element.querySelector('[data-capability]')).toBeNull();
    TestBed.resetTestingModule();
    const failing = await render(owner, { scenario: 'error' });
    expect(text(failing.element.querySelector('nw-data-state'))).toContain(t.states.errorTitle);
    failing.element.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await failing.settle();
    expect(failing.spy).toHaveBeenCalledTimes(2);
  });
});
