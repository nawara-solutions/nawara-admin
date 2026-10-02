import { TestBed } from '@angular/core/testing';
import en from '../../../../../i18n/en.json';
import { AuthSession } from '../../../../core/auth/auth-session';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../../core/context/scope-directory.fixtures';
import { configureAuthPage, settle, text } from '../../testing/auth-testing';
import { PlatformChoicePage } from './platform-choice.page';

describe('PlatformChoicePage', () => {
  it('lists only the assigned platforms by name, as links into their scope', async () => {
    configureAuthPage(PlatformChoicePage);
    TestBed.inject(AuthSession).establish({
      kind: 'operator',
      userId: 'p',
      email: 'operator@x.invalid',
      platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
    });
    const fixture = TestBed.createComponent(PlatformChoicePage);
    await settle(fixture);
    const page = fixture.nativeElement as HTMLElement;
    expect(text(page.querySelector('h1'))).toBe(en.auth.platform.title);
    expect(text(page.querySelector('.identity-row__role'))).toBe(en.auth.platform.operator);
    const cards = Array.from(page.querySelectorAll<HTMLAnchorElement>('.platform-choice__card'));
    expect(cards.map((card) => text(card.querySelector('.platform-choice__name')))).toEqual([
      'Nawara School',
      'Nawara Drive',
    ]);
    expect(cards[0]?.getAttribute('href')).toBe(`/platforms/${DEMO_SCHOOL_PLATFORM_ID}`);
    expect(cards[1]?.getAttribute('aria-label')).toBe('Open Nawara Drive');
    expect(page.textContent).not.toMatch(/\d+ (organizations|memberships)/);
  });
});
