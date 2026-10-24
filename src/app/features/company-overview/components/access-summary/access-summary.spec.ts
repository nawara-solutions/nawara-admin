import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../../i18n/en.json';
import { AccessSummaryList } from './access-summary';

describe('Company Overview → Access & security (P9-S4a link)', () => {
  it('"Account security" opens the owner’s Security overview (no longer a disabled, unbuilt destination)', async () => {
    TestBed.configureTestingModule({
      imports: [
        AccessSummaryList,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(AccessSummaryList);
    fixture.componentRef.setInput('access', null);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const link = [...element.querySelectorAll<HTMLAnchorElement>('a')].find(
      (a) => a.textContent?.trim() === en.companyOverview.access.owner.action,
    );
    expect(link?.getAttribute('href')).toBe('/settings/security');
    expect(
      [...element.querySelectorAll('button[disabled]')].map((b) => b.textContent?.trim()),
    ).not.toContain(en.companyOverview.access.owner.action);
  });
});
