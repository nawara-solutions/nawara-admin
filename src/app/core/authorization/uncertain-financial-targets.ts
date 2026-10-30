import { Injectable } from '@angular/core';
import { ReceiptBinding } from './receipt.model';

/**
 * The financial targets whose last command has an UNCERTAIN outcome on a route without `Idempotency-Key` (F1-S5;
 * docs/design/f1-financial-authorization.md §0.1, §7.2): fraud-hold place and release, external surplus repayment, recovery
 * write-off. Until Core answers CF-74, no new intent for such a target may start in this tab: not automatically, and not by an
 * unverified manual resubmission. Only a read that PROVES the command was applied lifts the block; a read that shows nothing
 * applied does not.
 *
 * In memory only (never browser storage, by rule): a reload or another tab does not see it. That limit is why CF-74 stays open;
 * Core remains the authority and refuses what it must.
 */
@Injectable({ providedIn: 'root' })
export class UncertainFinancialTargets {
  private readonly blocked = new Set<string>();

  block(binding: ReceiptBinding): void {
    this.blocked.add(targetOf(binding));
  }

  isBlocked(binding: ReceiptBinding): boolean {
    return this.blocked.has(targetOf(binding));
  }

  /** Only after a Core answer or read that proves the command was applied. */
  resolveApplied(binding: ReceiptBinding): void {
    this.blocked.delete(targetOf(binding));
  }
}

/**
 * The target a binding acts on: its operation and its ids. Amounts, currencies and reasons are left out on purpose, so a binding
 * re-read with another amount (an outstanding balance that changed) is still the same blocked target.
 */
export function targetOf(binding: ReceiptBinding): string {
  const ids = Object.entries(binding)
    .filter(([key]) => key.endsWith('Id'))
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([binding.operation, ids]);
}
