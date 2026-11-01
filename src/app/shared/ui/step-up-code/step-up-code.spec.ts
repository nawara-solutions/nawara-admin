import { vi } from 'vitest';
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
import { NW_STEP_UP_CODE_LENGTH, NwStepUpCode, NwStepUpCodeLabels } from './step-up-code';

type Catalog = typeof en;

/** The labels as a caller builds them from the shared `actions.stepUp.*` catalog keys. */
const labelsOf = (catalog: Catalog): NwStepUpCodeLabels => ({
  purposeIntro: catalog.actions.stepUp.purposeIntro,
  label: catalog.actions.stepUp.codeLabel,
  hint: catalog.actions.stepUp.codeHint,
  expired: catalog.actions.stepUp.expired,
  demoTitle: catalog.actions.stepUp.demoTitle,
});

@Component({
  imports: [NwStepUpCode],
  template: `
    <div [attr.dir]="dir()">
      <form (submit)="onSubmit($event)">
        <nw-step-up-code
          [labels]="labels()"
          [purpose]="purpose()"
          [(code)]="code"
          [error]="error()"
          [expired]="expired()"
          [busy]="busy()"
          [disabled]="disabled()"
          [demoNote]="demoNote()"
        />
        <button type="submit">Verify</button>
      </form>
    </div>
  `,
})
class Host {
  readonly dir = signal<'ltr' | 'rtl'>('ltr');
  readonly labels = signal(labelsOf(en));
  readonly purpose = signal<string | undefined>('creating the platform “Atlas”');
  readonly code = signal('');
  readonly error = signal<string | undefined>(undefined);
  readonly expired = signal(false);
  readonly busy = signal(false);
  readonly disabled = signal(false);
  readonly demoNote = signal<string | null>(null);
  readonly submits: string[] = [];
  readonly entry = viewChild.required(NwStepUpCode);

  onSubmit(event: Event): void {
    event.preventDefault();
    this.submits.push(this.code());
  }
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const host = fixture.componentInstance;
  const input = () => element.querySelector<HTMLInputElement>('input')!;
  const stable = () => fixture.whenStable();
  return { fixture, element, host, input, stable };
}

/** A paste event carrying `value`, as the browser fires it. */
function paste(target: HTMLInputElement, value: string): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => value } });
  target.dispatchEvent(event);
  return event;
}

describe('nw-step-up-code', () => {
  it('is an authenticator-code field: labelled, described by the purpose and hint, left to right', async () => {
    const { element, input } = await render();
    const field = input();
    expect(field.name).toBe('step-up-code');
    expect(field.type).toBe('text');
    expect(field.getAttribute('autocomplete')).toBe('one-time-code');
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.getAttribute('spellcheck')).toBe('false');
    expect(field.getAttribute('dir')).toBe('ltr');
    expect(element.querySelector('label')?.htmlFor).toBe(field.id);
    expect(text(element.querySelector('label'))).toBe(en.actions.stepUp.codeLabel);

    const described = field.getAttribute('aria-describedby')!.split(' ');
    expect(described.length).toBe(2);
    expect(text(document.getElementById(described[0]!))).toBe(
      `${en.actions.stepUp.purposeIntro} creating the platform “Atlas”`,
    );
    expect(text(document.getElementById(described[1]!))).toBe(en.actions.stepUp.codeHint);
    expect(field.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows no purpose block when the caller gives none', async () => {
    const { host, element, input, stable } = await render();
    host.purpose.set(undefined);
    await stable();
    expect(element.querySelector('.nw-step-up-code__purpose')).toBeNull();
    expect(input().getAttribute('aria-describedby')!.split(' ').length).toBe(1);
  });

  it('keeps the code as typed in the caller model, both ways', async () => {
    const { host, input, stable } = await render();
    input().value = '12 34';
    input().dispatchEvent(new Event('input'));
    expect(host.code()).toBe('12 34');
    await stable();
    host.code.set('');
    await stable();
    expect(input().value).toBe('');
  });

  it('never writes the code to browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { input } = await render();
    input().value = '123456';
    input().dispatchEvent(new Event('input'));
    paste(input(), '654 321');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('takes a pasted code without its spaces or hyphens', async () => {
    const { host, input, stable } = await render();
    for (const pasted of ['123 456', '123-456', ' 123456\n']) {
      host.code.set('');
      await stable();
      const event = paste(input(), pasted);
      expect(event.defaultPrevented).toBe(true);
      expect(input().value).toBe('123456');
      expect(host.code()).toBe('123456');
      await stable();
    }
    expect(NW_STEP_UP_CODE_LENGTH).toBe(6);
  });

  it('leaves any other paste to the browser', async () => {
    const { host, input } = await render();
    for (const pasted of ['12345', '1234567', 'abc def', '12a456']) {
      const event = paste(input(), pasted);
      expect(event.defaultPrevented).toBe(false);
      expect(host.code()).toBe('');
    }
  });

  it('ignores a paste while busy or disabled', async () => {
    const { host, input, stable } = await render();
    host.busy.set(true);
    await stable();
    expect(paste(input(), '123456').defaultPrevented).toBe(false);
    host.busy.set(false);
    host.disabled.set(true);
    await stable();
    expect(paste(input(), '123456').defaultPrevented).toBe(false);
    expect(host.code()).toBe('');
  });

  it('submits through the caller form with Enter, never by itself', async () => {
    const { host, input } = await render();
    input().value = '123456';
    input().dispatchEvent(new Event('input'));
    expect(host.submits).toEqual([]);
    input().form?.requestSubmit();
    expect(host.submits).toEqual(['123456']);
  });

  it('marks a refused code invalid and says why', async () => {
    const { host, input, element, stable } = await render();
    host.error.set(en.actions.failure.verificationRefused);
    await stable();
    expect(input().getAttribute('aria-invalid')).toBe('true');
    const described = input().getAttribute('aria-describedby')!.split(' ');
    expect(text(document.getElementById(described.at(-1)!))).toBe(
      en.actions.failure.verificationRefused,
    );
    expect(text(element.querySelector('.nw-form-field__error'))).toBe(
      en.actions.failure.verificationRefused,
    );
  });

  it('shows the expired message, and a stated error before it', async () => {
    const { host, input, element, stable } = await render();
    host.expired.set(true);
    await stable();
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(text(element.querySelector('.nw-form-field__error'))).toBe(en.actions.stepUp.expired);
    host.error.set(en.actions.failure.verificationRefused);
    await stable();
    expect(text(element.querySelector('.nw-form-field__error'))).toBe(
      en.actions.failure.verificationRefused,
    );
  });

  it('is read only and busy while verifying, and can be disabled', async () => {
    const { host, input, stable } = await render();
    host.busy.set(true);
    await stable();
    expect(input().readOnly).toBe(true);
    expect(input().getAttribute('aria-busy')).toBe('true');
    expect(input().disabled).toBe(false);
    host.busy.set(false);
    await stable();
    expect(input().readOnly).toBe(false);
    expect(input().getAttribute('aria-busy')).toBeNull();
    host.disabled.set(true);
    await stable();
    expect(input().disabled).toBe(true);
  });

  it('moves focus to the code when the caller asks', async () => {
    const { host, input } = await render();
    expect(document.activeElement).not.toBe(input());
    host.entry().focus();
    expect(document.activeElement).toBe(input());
  });

  it('shows the demo note only when given, as a note', async () => {
    const { host, element, stable } = await render();
    expect(element.querySelector('.nw-step-up-code__demo')).toBeNull();
    host.demoNote.set(en.actions.stepUp.demoNote.replace('{{code}}', '123456'));
    await stable();
    const note = element.querySelector('.nw-step-up-code__demo');
    expect(note?.getAttribute('role')).toBe('note');
    expect(text(note)).toBe(
      `${en.actions.stepUp.demoTitle} ${en.actions.stepUp.demoNote.replace('{{code}}', '123456')}`,
    );
  });

  it.each([
    ['en', en],
    ['fr', fr],
    ['ar', ar],
  ] as const)('shows the %s catalog copy', async (_, catalog) => {
    const { host, element, stable } = await render();
    host.labels.set(labelsOf(catalog));
    host.expired.set(true);
    await stable();
    for (const value of Object.values(labelsOf(catalog))) expect(value.trim()).not.toBe('');
    expect(text(element.querySelector('label'))).toBe(catalog.actions.stepUp.codeLabel);
    expect(text(element.querySelector('.nw-form-field__hint'))).toBe(
      catalog.actions.stepUp.codeHint,
    );
    expect(text(element.querySelector('.nw-step-up-code__purpose-intro'))).toBe(
      catalog.actions.stepUp.purposeIntro,
    );
    expect(text(element.querySelector('.nw-form-field__error'))).toBe(
      catalog.actions.stepUp.expired,
    );
  });

  it('keeps the code left to right in a right-to-left page', async () => {
    const { host, input, element, stable } = await render();
    host.dir.set('rtl');
    host.labels.set(labelsOf(ar));
    await stable();
    expect(element.querySelector('[dir="rtl"] nw-step-up-code')).not.toBeNull();
    expect(input().getAttribute('dir')).toBe('ltr');
    // The purpose and notes follow the page: no direction of their own.
    expect(element.querySelector('.nw-step-up-code__purpose')?.getAttribute('dir')).toBeNull();
  });
});
