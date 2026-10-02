import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwInlineAlert, NwInlineAlertTone } from './inline-alert';

@Component({
  imports: [NwInlineAlert],
  template: `<nw-inline-alert
    [tone]="tone()"
    [actionLabel]="label()"
    (action)="actions = actions + 1"
    >Message</nw-inline-alert
  >`,
})
class Host {
  readonly tone = signal<NwInlineAlertTone>('danger');
  readonly label = signal<string | undefined>(undefined);
  actions = 0;
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const alert = () => fixture.nativeElement.querySelector('nw-inline-alert') as HTMLElement;
  return { fixture, alert };
}

describe('NwInlineAlert', () => {
  it('announces errors and warnings at once, information politely', async () => {
    const { fixture, alert } = render();
    expect(alert().getAttribute('role')).toBe('alert');
    expect(alert().classList).toContain('nw-inline-alert--danger');
    fixture.componentInstance.tone.set('success');
    await fixture.whenStable();
    expect(alert().getAttribute('role')).toBe('status');
    expect(alert().textContent?.trim()).toBe('Message');
  });

  it('offers its action only when labelled', async () => {
    const { fixture, alert } = render();
    expect(alert().querySelector('button')).toBeNull();
    fixture.componentInstance.label.set('Try again');
    await fixture.whenStable();
    const button = alert().querySelector('button');
    expect(button?.textContent?.trim()).toBe('Try again');
    button?.click();
    expect(fixture.componentInstance.actions).toBe(1);
  });
});
