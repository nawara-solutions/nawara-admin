import { DestroyRef, Signal, computed, effect, inject } from '@angular/core';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext } from '../../../core/context/scope-context';

/**
 * Publishes the Organization's NAME as this page's breadcrumb label while it is shown, and takes it back otherwise or
 * when the page goes (`EntityLabel`). Only the Organization's name: never a member's contact. Call in a constructor.
 */
export function publishOrganizationLabel(name: Signal<string | null>): void {
  const label = inject(EntityLabel);
  const context = inject(ScopeContext);
  const path = computed(() => context.url().split(/[?#]/)[0] ?? '');
  let published: string | null = null;
  effect(() => {
    const current = path();
    const value = name();
    if (published !== null && published !== current) label.clear(published);
    if (value !== null) {
      label.set(current, value);
      published = current;
    } else {
      label.clear(current);
      published = null;
    }
  });
  inject(DestroyRef).onDestroy(() => {
    if (published !== null) label.clear(published);
  });
}
