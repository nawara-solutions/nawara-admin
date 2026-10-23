import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Shell } from './shell';

/** The shell's own logic, without rendering its children (the drawer itself is checked in the browser review). */
class ShellUnderTest extends Shell {
  open(): void {
    this.drawerOpen.set(true);
  }
  get isOpen(): boolean {
    return this.drawerOpen();
  }
  escape(event: Event): void {
    this.onEscape(event);
  }
}

function setUp() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  return TestBed.runInInjectionContext(() => new ShellUnderTest());
}

const escape = (handledByOverlay: boolean) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  if (handledByOverlay) event.preventDefault();
  return event;
};

describe('Shell: Escape closes only the topmost layer', () => {
  it('leaves the drawer open when the account menu above it took the Escape', () => {
    const shell = setUp();
    shell.open();
    shell.escape(escape(true));
    expect(shell.isOpen).toBe(true);
  });

  it('closes the drawer on an Escape nothing above it handled', () => {
    const shell = setUp();
    shell.open();
    shell.escape(escape(false));
    expect(shell.isOpen).toBe(false);
  });
});
