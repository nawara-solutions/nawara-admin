import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER } from 'rxjs';
import en from '../../../../i18n/en.json';
import { ViewState } from '../../../core/state/view-state';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NW_DIALOG_TITLE_ID } from '../../../shared/ui/dialog/dialog.service';
import { OrganizationCommercial } from '../domain/organization-commercial.model';
import { NOW, PLATFORMS, commercialOf, detailOf } from '../testing/organizations-testing';
import {
  OrganizationDetailsPanel,
  OrganizationDetailsPanelData,
} from './organization-details-panel';

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function render(commercial: ViewState<OrganizationCommercial>) {
  const data: OrganizationDetailsPanelData = {
    activity: null,
    detail: () => detailOf(),
    platform: PLATFORMS[0]!,
    mayEdit: false,
    editAvailable: false,
    edit: () => undefined,
    showCommercial: true,
    canViewSubscriptions: true,
    commercial: () => commercial,
    retryCommercial: () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [
      OrganizationDetailsPanel,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      { provide: DIALOG_DATA, useValue: data },
      // The NwDialog frame listens to these; nothing here closes or emits.
      {
        provide: DialogRef,
        useValue: { close: () => undefined, backdropClick: NEVER, keydownEvents: NEVER },
      },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: NW_DIALOG_TITLE_ID, useValue: 'organization-details-title' },
    ],
  });
  const fixture = TestBed.createComponent(OrganizationDetailsPanel);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  element.querySelector<HTMLButtonElement>('#organization-details-tab-payments')!.click();
  fixture.detectChanges();
  const section = () =>
    [...element.querySelectorAll('section')].find(
      (s) => text(s.querySelector('h3')) === en.organizations.detail.assistedPayments,
    ) ?? null;
  return { element, section };
}

describe('Organization details panel: assisted payments (WP-2.2)', () => {
  it('says eligibility is not verified and why, with no policy rows and no "Change policy"', () => {
    const { element, section } = render({ status: 'success', data: commercialOf() });
    const assisted = section()!;
    expect(text(assisted.querySelector('[data-eligibility]'))).toBe(
      en.organizations.eligibility.notVerified,
    );
    expect(text(assisted)).toContain(en.organizations.eligibility.notVerifiedDetail);
    expect(assisted.querySelectorAll('dl, button, [role="switch"], input')).toHaveLength(0);
    expect(text(assisted)).not.toMatch(/\b(enabled|disabled|inherits|override|eligible)\b/i);
    // The other commercial sections are still shown beside it.
    expect(text(element)).toContain(en.organizations.detail.assistedPayments);
  });

  it('keeps an unavailable section as unavailable', () => {
    const { section } = render({
      status: 'success',
      data: { ...commercialOf(), assistedPayments: { status: 'unavailable' } },
    });
    expect(text(section())).toContain(en.organizations.states.sectionUnavailable);
    expect(section()!.querySelector('[data-eligibility]')).toBeNull();
  });
});
