import { Injectable, signal } from '@angular/core';
import { NwStatusTone } from '../status-badge/status-badge';

export interface NwToast {
  readonly id: number;
  readonly message: string;
  readonly tone: NwStatusTone;
}

export interface NwToastOptions {
  readonly tone?: NwStatusTone;
  /** Milliseconds before auto-dismiss; `null` keeps it until dismissed. Errors persist by default (WCAG 2.2.1). */
  readonly duration?: number | null;
}

const DEFAULT_DURATION = 5000;

/** Transient feedback. Rendered once by `nw-toast-outlet`; messages are already localized by the caller. */
@Injectable({ providedIn: 'root' })
export class NwToastService {
  private nextId = 0;
  private readonly items = signal<readonly NwToast[]>([]);
  readonly toasts = this.items.asReadonly();

  show(message: string, options: NwToastOptions = {}): number {
    const tone = options.tone ?? 'info';
    const toast: NwToast = { id: this.nextId++, message, tone };
    this.items.update((items) => [...items, toast]);
    const duration =
      options.duration === undefined
        ? tone === 'danger'
          ? null
          : DEFAULT_DURATION
        : options.duration;
    if (duration !== null) setTimeout(() => this.dismiss(toast.id), duration);
    return toast.id;
  }

  dismiss(id: number): void {
    this.items.update((items) => items.filter((toast) => toast.id !== id));
  }
}
