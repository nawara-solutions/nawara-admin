import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('hosts a router outlet', () => {
    const fixture = TestBed.createComponent(App);
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });

  it('hosts the toast outlet once, outside the routed content', () => {
    const fixture = TestBed.createComponent(App);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('nw-toast-outlet').length).toBe(
      1,
    );
  });

  it('runs without zone.js', () => {
    expect('Zone' in globalThis).toBe(false);
  });
});
