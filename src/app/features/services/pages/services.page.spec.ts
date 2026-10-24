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
import { CORE_SERVICES } from '../../../core/core-services/core-service.model';
import {
  ServiceInventoryGateway,
  UnavailableServiceInventoryGateway,
} from '../../../core/core-services/service-inventory.gateway';
import {
  MockServiceInventoryGateway,
  SERVICES_DEMO_SCENARIO,
  ServicesDemoScenario,
} from '../../../core/core-services/service-inventory.mock';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { ServicesFacade } from '../application/services.facade';
import { ServicesPage } from './services.page';

const t = en.services;
const c = en.coreServices;

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
  }: { gateway?: 'mock' | 'unavailable'; scenario?: ServicesDemoScenario } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      ServicesPage,
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
      { provide: SERVICES_DEMO_SCENARIO, useValue: scenario },
      {
        provide: ServiceInventoryGateway,
        useClass:
          gateway === 'mock' ? MockServiceInventoryGateway : UnavailableServiceInventoryGateway,
      },
      ServicesFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const spy = vi.spyOn(TestBed.inject(ServiceInventoryGateway), 'inventory');
  const fixture = TestBed.createComponent(ServicesPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async (ms = 10) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  for (
    let i = 0;
    i < 20 && !element.querySelector('nw-data-state:not([state="loading"]), [data-service]');
    i++
  )
    await settle();
  await settle();
  return { element, spy, settle };
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Services & health page (P8-S2)', { timeout: 15_000 }, () => {
  it('lists the eight documented services with their responsibilities', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.header.title);
    const items = [...element.querySelectorAll('[data-service]')];
    expect(items.map((i) => i.getAttribute('data-service'))).toEqual([...CORE_SERVICES]);
    expect(
      items.map((i) => [text(i.querySelector('h3')), text(i.querySelector('.services__owns'))]),
    ).toEqual(CORE_SERVICES.map((s) => [c.services[s].name, c.services[s].owns]));
    expect(text(element.querySelector('.services__card .services__muted'))).toBe(
      t.list.documentation,
    );
  });

  it('says live health is unavailable, and shows no status, uptime, latency, incident or version', async () => {
    const { element } = await render();
    expect(text(element.querySelector('[data-live-health] h2'))).toBe(c.liveHealth.unavailable);
    expect(text(element.querySelector('[data-live-health] p'))).toBe(t.live.body);
    for (const item of element.querySelectorAll('[data-service]'))
      expect(text(item)).toContain(`${t.list.liveHealth}: ${t.list.unavailable}`);
    const list = text(element.querySelector('.services__list'));
    expect(list).not.toMatch(
      /operational|delayed|degraded|healthy|outage|uptime|latency|incident|\bv\d|\d+(\.\d+)?\s?(ms|%)/i,
    );
    expect(
      element.querySelectorAll('[class*="dot"], [class*="status"], progress, meter'),
    ).toHaveLength(0);
    expect(element.textContent).not.toMatch(/https?:\/\/|localhost|\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect([...element.querySelectorAll('[data-later] li')].map((li) => text(li))).toEqual([
      t.later.status,
      t.later.notHere,
      t.later.never,
    ]);
    // No control, no link to an internal system.
    expect(element.querySelectorAll('button, a, input, select')).toHaveLength(0);
  });

  it('loads once and never polls or calls the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { spy, settle } = await render();
    await settle(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('never asks an operator’s gateway, whatever their Platform assignments', async () => {
    const { element, spy } = await render(operator);
    expect(spy).not.toHaveBeenCalled();
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('[data-service]')).toBeNull();
  });

  it('says it is not available in a build without the mock, and offers a retry after an error', async () => {
    const unavailable = await render(owner, { gateway: 'unavailable' });
    expect(text(unavailable.element.querySelector('nw-data-state'))).toContain(
      t.states.notInBuildTitle,
    );
    expect(unavailable.element.querySelector('[data-service]')).toBeNull();
    TestBed.resetTestingModule();
    const failing = await render(owner, { scenario: 'error' });
    expect(text(failing.element.querySelector('nw-data-state'))).toContain(t.states.errorTitle);
    failing.element.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await failing.settle();
    expect(failing.spy).toHaveBeenCalledTimes(2);
  });
});
