import { TestBed } from '@angular/core/testing';
import { Actor } from '../auth/actor';
import { AuthSession } from '../auth/auth-session';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { EntityLabel } from './entity-label';
import { companyId } from './scope.model';

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};

function setUp() {
  TestBed.configureTestingModule({
    providers: [
      EntityLabel,
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
    ],
  });
  const session = TestBed.inject(AuthSession);
  session.establish(owner);
  return { label: TestBed.inject(EntityLabel), session };
}

describe('EntityLabel (the breadcrumbs’ entity name)', () => {
  it('answers only for the page that set it', () => {
    const { label } = setUp();
    label.set('/platforms/p/organizations/a', 'Collège Riad');
    expect(label.labelFor('/platforms/p/organizations/a')).toBe('Collège Riad');
    expect(label.labelFor('/platforms/p/organizations/b')).toBeNull();
  });

  it('is cleared by its own page, and not by another’s', () => {
    const { label } = setUp();
    label.set('/a', 'A');
    label.clear('/b');
    expect(label.labelFor('/a')).toBe('A');
    label.clear('/a');
    expect(label.labelFor('/a')).toBeNull();
  });

  it('is never read back after a sign-out', () => {
    const { label, session } = setUp();
    label.set('/a', 'A');
    session.signOut();
    expect(label.labelFor('/a')).toBeNull();
    session.establish({ ...owner, userId: 'someone-else' });
    expect(label.labelFor('/a')).toBeNull();
  });
});
