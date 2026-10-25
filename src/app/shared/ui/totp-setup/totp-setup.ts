import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { encode } from 'uqr';
import { NwButton } from '../button/button';
import { NwIcon } from '../icon/icon';
import { NwSpinner } from '../spinner/spinner';

/** What a setup shows: the base32 key and the `otpauth` URI it came with. Never stored or sent by this component. */
export interface NwTotpSetupKey {
  readonly secret: string;
  readonly otpauthUri: string;
}

/** The component's copy, already localized by the caller (it owns none). */
export interface NwTotpSetupLabels {
  /** The QR image's accessible name. */
  readonly qr: string;
  readonly cantScan: string;
  readonly key: string;
  readonly copyKey: string;
  readonly copied: string;
  readonly copyFailed: string;
  /** Below the key, e.g. "Time-based · 6 digits". */
  readonly meta: string;
  /** Shown, and announced, while no key is there yet. */
  readonly preparing: string;
}

/** The QR quiet zone, in modules (the QR standard's 4). */
const QR_QUIET_ZONE = 4;

/**
 * The presentation of an authenticator-app setup: a QR code of the `otpauth` URI, drawn here as one SVG path (a local
 * library, nothing sent anywhere), and the setup key in groups of four, LTR, with a copy button (the clipboard is
 * written only on request). While `setup` is `null` it shows the setup being prepared. It holds no state beyond the
 * copy result: the key lives in its caller's memory, and is gone from here as soon as the caller drops it.
 */
@Component({
  selector: 'nw-totp-setup',
  imports: [NwButton, NwIcon, NwSpinner],
  templateUrl: './totp-setup.html',
  styleUrl: './totp-setup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-totp-setup' },
})
export class NwTotpSetup {
  private readonly clipboard = inject(DOCUMENT).defaultView?.navigator.clipboard;

  readonly setup = input.required<NwTotpSetupKey | null>();
  readonly labels = input.required<NwTotpSetupLabels>();

  /** The copy result, reset when the setup changes (a new key was never copied). */
  protected readonly copyResult = linkedSignal<NwTotpSetupKey | null, 'copied' | 'failed' | null>({
    source: this.setup,
    computation: () => null,
  });

  /** The setup key in groups of four, for reading and typing (copied without the spaces). */
  protected readonly groupedKey = computed(
    () =>
      this.setup()
        ?.secret.match(/.{1,4}/g)
        ?.join(' ') ?? '',
  );

  /** The QR modules as one SVG path, with its quiet zone; medium error correction. */
  protected readonly qr = computed(() => {
    const setup = this.setup();
    if (setup === null) return null;
    const { data } = encode(setup.otpauthUri, { ecc: 'M', border: QR_QUIET_ZONE });
    let path = '';
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) path += `M${x.toString()} ${y.toString()}h1v1h-1z`;
      }),
    );
    return { size: data.length, path };
  });

  protected async copyKey(): Promise<void> {
    const setup = this.setup();
    if (!setup) return;
    this.copyResult.set(null);
    try {
      if (!this.clipboard) throw new Error('clipboard unavailable');
      await this.clipboard.writeText(setup.secret);
      // A setup replaced or dropped meanwhile keeps no stale result.
      if (this.setup() === setup) this.copyResult.set('copied');
    } catch {
      if (this.setup() === setup) this.copyResult.set('failed');
    }
  }
}
