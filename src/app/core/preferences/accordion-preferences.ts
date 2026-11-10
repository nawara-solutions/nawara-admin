import { Injectable, inject, signal } from '@angular/core';
import { PreferenceStore } from './preference-store';

export type OperatorTotalsMode = 'accordion' | 'visible' | 'hidden';

@Injectable({ providedIn: 'root' })
export class AccordionPreferences {
  private readonly store = inject(PreferenceStore);
  readonly operatorTotalsMode = signal<OperatorTotalsMode>(this.readMode('operatorTotalsMode'));
  readonly licensesOverviewMode = signal<OperatorTotalsMode>(this.readMode('licensesOverviewMode'));
  readonly licensesOverviewOpen = signal(this.store.read('licensesOverviewOpen') !== 'false');
  readonly operatorTotalsOpen = signal(this.store.read('operatorTotalsOpen') !== 'false');
  readonly platformFiguresVisible = signal(this.store.read('platformFiguresVisible') !== 'false');
  readonly platformSubscriptionsVisible = signal(this.store.read('platformSubscriptionsVisible') !== 'false');

  setPlatformFiguresVisible(visible: boolean): void {
    this.platformFiguresVisible.set(visible);
    this.store.write('platformFiguresVisible', String(visible));
  }

  setPlatformSubscriptionsVisible(visible: boolean): void {
    this.platformSubscriptionsVisible.set(visible);
    this.store.write('platformSubscriptionsVisible', String(visible));
  }

  setOperatorTotalsMode(mode: OperatorTotalsMode): void {
    this.operatorTotalsMode.set(mode);
    this.store.write('operatorTotalsMode', mode);
  }

  toggleOperatorTotals(): void {
    const open = !this.operatorTotalsOpen();
    this.operatorTotalsOpen.set(open);
    this.store.write('operatorTotalsOpen', String(open));
  }

  setLicensesOverviewMode(mode: OperatorTotalsMode): void {
    this.licensesOverviewMode.set(mode);
    this.store.write('licensesOverviewMode', mode);
  }

  toggleLicensesOverview(): void {
    const open = !this.licensesOverviewOpen();
    this.licensesOverviewOpen.set(open);
    this.store.write('licensesOverviewOpen', String(open));
  }

  private readMode(name: 'operatorTotalsMode' | 'licensesOverviewMode'): OperatorTotalsMode {
    const value = this.store.read(name);
    return value === 'visible' || value === 'hidden' ? value : 'accordion';
  }
}
