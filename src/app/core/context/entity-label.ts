import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthSession } from '../auth/auth-session';

interface Entry {
  /** The URL path (no query or fragment) of the page that set it. */
  readonly path: string;
  /** User data (an Organization's name): rendered isolated, never translated. */
  readonly label: string;
  /** Who was signed in when it was set. */
  readonly userId: string | null;
}

/**
 * The name of the entity a page shows (an Organization), for the breadcrumbs, which cannot know it themselves.
 * Provided by the shell route. A page sets it once its entity has loaded and clears it when destroyed; an entry is read
 * back only for the same path and the same signed-in actor, so a name can never be shown for another page, another
 * Organization or after a sign-out, even if a clear was missed.
 */
@Injectable()
export class EntityLabel {
  private readonly session = inject(AuthSession);
  private readonly current = signal<Entry | null>(null);

  /** The label for `path`, or `null`. */
  readonly entry = computed(() => {
    const entry = this.current();
    return entry !== null && entry.userId === (this.session.actor()?.userId ?? null) ? entry : null;
  });

  labelFor(path: string): string | null {
    const entry = this.entry();
    return entry !== null && entry.path === path ? entry.label : null;
  }

  set(path: string, label: string): void {
    this.current.set({ path, label, userId: this.session.actor()?.userId ?? null });
  }

  /** Clears the label set for `path` (another page's label is left alone). */
  clear(path: string): void {
    if (this.current()?.path === path) this.current.set(null);
  }
}
