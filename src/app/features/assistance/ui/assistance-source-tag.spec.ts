import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { AssistanceInformationSource } from '../domain/assistance.model';
import { AssistanceSourceTag } from './assistance-source-tag';

@Component({
  imports: [AssistanceSourceTag],
  template: '<adm-assistance-source-tag [source]="source()" />',
})
class Host {
  readonly source = signal<AssistanceInformationSource>('report');
}

async function render(lang: 'en' | 'ar' = 'en') {
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en, ar },
        translocoConfig: { availableLangs: ['en', 'ar'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return fixture;
}

describe('AssistanceSourceTag (A6)', () => {
  it('names each source in words, with its own icon and style class, never colour alone', async () => {
    const fixture = await render();
    const seen = new Set<string>();
    for (const source of ['fact', 'report', 'decision', 'derived'] as const) {
      fixture.componentInstance.source.set(source);
      await fixture.whenStable();
      const tag = (fixture.nativeElement as HTMLElement).querySelector(
        'adm-assistance-source-tag',
      )!;
      expect(tag.getAttribute('data-source')).toBe(source);
      expect(tag.classList).toContain(`assistance-source-tag--${source}`);
      expect(tag.textContent?.trim()).toBe(en.assistanceCases.case.source[source]);
      seen.add(tag.querySelector('nw-icon')?.getAttribute('ng-reflect-name') ?? tag.innerHTML);
    }
    expect(seen.size).toBe(4);
  });

  it('speaks Arabic in an Arabic page', async () => {
    const fixture = await render('ar');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('adm-assistance-source-tag')
        ?.textContent?.trim(),
    ).toBe(ar.assistanceCases.case.source.report);
  });
});
