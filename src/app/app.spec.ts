import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the application name as the page heading inside main', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const heading = (fixture.nativeElement as HTMLElement).querySelector('main > h1');
    expect(heading?.textContent?.trim()).toBe('Nawara Admin');
  });

  it('hosts a router outlet', () => {
    const fixture = TestBed.createComponent(App);
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
    expect(TestBed.inject(Router)).toBeTruthy();
  });

  it('runs without zone.js', () => {
    expect('Zone' in globalThis).toBe(false);
  });
});
