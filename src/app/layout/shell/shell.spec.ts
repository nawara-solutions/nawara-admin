import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, provideRouter } from '@angular/router';
import { Shell, pageOf } from './shell';

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

describe('Shell: focus moves to the new page only when the page changes', () => {
  const page = (url: string) => pageOf(new DefaultUrlSerializer(), url);

  it('ignores query parameters and fragments (a tab, a filter or a sort stays on its control)', () => {
    expect(page('/platforms/p/organizations/o/members?status=pending&sort=oldest')).toBe(
      page('/platforms/p/organizations/o/members'),
    );
    expect(page('/platforms/p/organizations?q=riad#top')).toBe(page('/platforms/p/organizations'));
  });

  it('tells different pages apart', () => {
    expect(page('/platforms/p/organizations/o/members/m')).not.toBe(
      page('/platforms/p/organizations/o/members'),
    );
  });
});
