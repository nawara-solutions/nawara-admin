import { TestBed } from '@angular/core/testing';
import { NwToastOutlet } from './toast-outlet';
import { NwToastService } from './toast.service';

describe('NwToastService and outlet', () => {
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses informational toasts but keeps errors until dismissed', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(NwToastService);
    service.show('Saved', { tone: 'success' });
    const errorId = service.show('Failed', { tone: 'danger' });
    vi.advanceTimersByTime(6000);
    expect(service.toasts().map((t) => t.message)).toEqual(['Failed']);
    service.dismiss(errorId);
    expect(service.toasts()).toEqual([]);
  });

  it('renders errors in the assertive region and the rest in the polite one', async () => {
    const fixture = TestBed.createComponent(NwToastOutlet);
    fixture.componentRef.setInput('dismissLabel', 'Dismiss');
    const service = TestBed.inject(NwToastService);
    service.show('Saved', { tone: 'success', duration: null });
    service.show('Failed', { tone: 'danger' });
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[aria-live="assertive"]')?.textContent).toContain('Failed');
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('Saved');

    host.querySelector<HTMLButtonElement>('[aria-live="polite"] [aria-label="Dismiss"]')!.click();
    expect(service.toasts().map((t) => t.message)).toEqual(['Failed']);
  });
});
