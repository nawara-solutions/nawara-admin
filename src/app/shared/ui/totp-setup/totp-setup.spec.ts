import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { encode } from 'uqr';
import { NwTotpSetup, NwTotpSetupKey, NwTotpSetupLabels } from './totp-setup';

const LABELS: NwTotpSetupLabels = {
  qr: 'QR for the app',
  cantScan: 'Cannot scan?',
  key: 'Setup key',
  copyKey: 'Copy key',
  copied: 'Copied.',
  copyFailed: 'Not copied.',
  meta: 'Time-based',
  preparing: 'Preparing…',
};
const KEY: NwTotpSetupKey = {
  secret: 'ABCDEFGHIJKLMNOP',
  otpauthUri: 'otpauth://totp/Issuer:me?secret=ABCDEFGHIJKLMNOP&issuer=Issuer',
};

@Component({
  imports: [NwTotpSetup],
  template: `<nw-totp-setup [setup]="setup()" [labels]="labels" />`,
})
class Host {
  readonly setup = signal<NwTotpSetupKey | null>(KEY);
  readonly labels = LABELS;
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  return { fixture, element, host: fixture.componentInstance, settle };
}

function useClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('nw-totp-setup', () => {
  afterEach(() => Reflect.deleteProperty(navigator, 'clipboard'));

  it('draws the URI as a named QR image and shows the key in groups, left to right', async () => {
    const { element } = await render();
    const qr = element.querySelector('.nw-totp-setup__qr');
    expect(qr?.getAttribute('role')).toBe('img');
    expect(qr?.getAttribute('aria-label')).toBe(LABELS.qr);
    const { data } = encode(KEY.otpauthUri, { ecc: 'M', border: 4 });
    expect(qr?.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `0 0 ${data.length.toString()} ${data.length.toString()}`,
    );
    const key = element.querySelector('.nw-totp-setup__key-value');
    expect(text(key)).toBe('ABCD EFGH IJKL MNOP');
    expect(key?.getAttribute('dir')).toBe('ltr');
    expect(element.textContent).not.toContain('otpauth');
  });

  it('shows the setup being prepared, announced, while there is no key', async () => {
    const { element, host, fixture } = await render();
    host.setup.set(null);
    await fixture.whenStable();
    const preparing = element.querySelector('.nw-totp-setup__qr--preparing');
    expect(preparing?.getAttribute('role')).toBe('status');
    expect(text(preparing)).toBe(LABELS.preparing);
    expect(element.querySelector('.nw-totp-setup__key-value')).toBeNull();
  });

  it('copies the key without spaces on request only, and forgets the result for a new key', async () => {
    const copied: string[] = [];
    useClipboard(async (value) => {
      copied.push(value);
    });
    const { element, host, fixture, settle } = await render();
    expect(copied).toEqual([]);
    element.querySelector<HTMLButtonElement>('button')?.click();
    await settle();
    expect(copied).toEqual([KEY.secret]);
    expect(text(element.querySelector('.nw-totp-setup__copy-status'))).toBe(LABELS.copied);
    host.setup.set({ ...KEY, secret: 'QRSTUVWXYZ234567' });
    await fixture.whenStable();
    expect(element.querySelector('.nw-totp-setup__copy-status')).toBeNull();
  });

  it('says when the key could not be copied', async () => {
    useClipboard(() => Promise.reject(new Error('denied')));
    const { element, settle } = await render();
    element.querySelector<HTMLButtonElement>('button')?.click();
    await settle();
    expect(text(element.querySelector('.nw-totp-setup__copy-status--failed'))).toBe(
      LABELS.copyFailed,
    );
  });
});
