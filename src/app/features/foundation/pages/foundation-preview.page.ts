import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { formattingLocaleOf } from '../../../core/i18n/locale';
import { LocaleService } from '../../../core/i18n/locale.service';
import { NwButton } from '../../../shared/ui/button/button';
import { NwCheckbox } from '../../../shared/ui/checkbox/checkbox';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { NwIconButton } from '../../../shared/ui/icon-button/icon-button';
import { NwLink } from '../../../shared/ui/link/link';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../../shared/ui/menu/menu';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { BrandAssets } from '../components/brand-assets/brand-assets';
import { FoundationToolbar } from '../components/foundation-toolbar/foundation-toolbar';
import { SuspendMemberDialog } from '../components/suspend-member-dialog/suspend-member-dialog';

interface Swatch {
  readonly labelKey: string;
  readonly token: string;
}

/**
 * A2 design-foundation preview: brand, semantic tokens and the first `nw-*` primitives in the current theme and
 * language. It is the manual LTR/RTL × light/dark verification surface for A2 and is replaced by the shell in A3.
 */
@Component({
  selector: 'adm-foundation-preview-page',
  imports: [
    TranslocoPipe,
    BrandAssets,
    FoundationToolbar,
    NwButton,
    NwCheckbox,
    NwControl,
    NwDataState,
    NwFormField,
    NwIcon,
    NwIconButton,
    NwLink,
    NwMenu,
    NwMenuItem,
    NwMenuTrigger,
    NwStatusBadge,
  ],
  templateUrl: './foundation-preview.page.html',
  styleUrl: './foundation-preview.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'foundation-preview' },
})
export class FoundationPreviewPage {
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LocaleService);

  /** Number and date formatting in the current language; Arabic uses Latin digits (D-A2-3). */
  protected readonly formatted = computed(() => {
    const tag = formattingLocaleOf(this.locale.locale());
    const instant = new Date(Date.UTC(2026, 9, 1, 14, 30));
    return {
      tag,
      number: new Intl.NumberFormat(tag).format(1234567.89),
      date: new Intl.DateTimeFormat(tag, { dateStyle: 'long', timeZone: 'UTC' }).format(instant),
      time: new Intl.DateTimeFormat(tag, { timeStyle: 'short', timeZone: 'UTC' }).format(instant),
    };
  });

  protected readonly swatches: readonly Swatch[] = [
    { labelKey: 'foundation.palette.primary', token: '--nw-color-primary' },
    { labelKey: 'foundation.palette.brandSubtle', token: '--nw-surface-brand-subtle' },
    { labelKey: 'foundation.palette.focus', token: '--nw-focus-ring' },
    { labelKey: 'foundation.palette.textPrimary', token: '--nw-text-primary' },
    { labelKey: 'foundation.palette.textSecondary', token: '--nw-text-secondary' },
    { labelKey: 'foundation.palette.border', token: '--nw-border-default' },
    { labelKey: 'foundation.palette.page', token: '--nw-surface-page' },
    { labelKey: 'foundation.palette.raised', token: '--nw-surface-raised' },
    { labelKey: 'foundation.palette.sunken', token: '--nw-surface-sunken' },
    { labelKey: 'foundation.palette.inverse', token: '--nw-surface-inverse' },
  ];

  protected readonly gradients: readonly Swatch[] = [
    { labelKey: 'foundation.gradients.sunrise', token: '--nw-gradient-brand' },
    { labelKey: 'foundation.gradients.dusk', token: '--nw-gradient-brand-cool' },
  ];

  protected readonly brandIcons: readonly NwIconName[] = [
    'house',
    'users',
    'settings',
    'file-text',
    'chart-column',
    'bell',
    'folder',
    'calendar',
    'shield-check',
    'store',
    'credit-card',
    'hexagon',
  ];

  protected readonly directionalIcons: readonly NwIconName[] = [
    'arrow-left',
    'chevron-right',
    'log-out',
  ];

  protected readonly statuses: readonly { tone: NwStatusTone; labelKey: string }[] = [
    { tone: 'success', labelKey: 'foundation.status.active' },
    { tone: 'warning', labelKey: 'foundation.status.pending' },
    { tone: 'danger', labelKey: 'foundation.status.suspended' },
    { tone: 'info', labelKey: 'foundation.status.invited' },
  ];

  protected readonly values: readonly { icon: NwIconName; labelKey: string }[] = [
    { icon: 'user-round', labelKey: 'foundation.values.people' },
    { icon: 'sparkles', labelKey: 'foundation.values.innovation' },
    { icon: 'feather', labelKey: 'foundation.values.simplicity' },
    { icon: 'sun', labelKey: 'foundation.values.tomorrow' },
  ];

  /** Type specimens (glyph samples, not copy): shown in every UI language. */
  protected readonly specimens = {
    latin: 'Aa Bb Cc 0123456789',
    arabic: 'أبجد هوز حطي كلمن 0123456789',
    mono: 'org_01JD3K8Z9Q · AUTH_STEP_UP_REQUIRED',
  } as const;

  protected openSuspendDialog(): void {
    const ref = this.dialogs.open<boolean>(SuspendMemberDialog, { role: 'alertdialog' });
    ref.closed.subscribe((confirmed) => {
      if (confirmed) this.showToast('success');
    });
  }

  protected showToast(tone: 'success' | 'danger'): void {
    const key =
      tone === 'success' ? 'foundation.feedback.toastSuccess' : 'foundation.feedback.toastError';
    this.toasts.show(this.transloco.translate(key), { tone });
  }
}
