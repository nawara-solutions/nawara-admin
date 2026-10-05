import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { DEMO_DRIVE_PLATFORM_ID } from '../context/scope-directory.fixtures';
import { AppError } from '../errors/app-error';
import { DEMO_WORKING_CODE } from './auth.fixtures';
import { MockAuthGateway } from './auth.mock';
import { OperatorIdentifier } from './operator-identifier';

const SCHOOL_OPERATOR: OperatorIdentifier = {
  kind: 'email',
  email: 'operator.school@demo.nawara.invalid',
};
const PHONE_OPERATOR: OperatorIdentifier = { kind: 'phone', phone: '+99900000001' };

function gateway() {
  TestBed.configureTestingModule({
    providers: [MockAuthGateway, { provide: DEMO_LATENCY_MS, useValue: 0 }],
  });
  return TestBed.inject(MockAuthGateway);
}

async function error(answer: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockAuthGateway: working code (demo only)', () => {
  it('answers every well-formed request alike, known or not', async () => {
    const mock = gateway();
    await expect(firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR))).resolves.toBeUndefined();
    await expect(
      firstValueFrom(mock.requestWorkingCode({ kind: 'email', email: 'nobody@demo.invalid' })),
    ).resolves.toBeUndefined();
  });

  it('accepts the code only after a request, and only once', async () => {
    const mock = gateway();
    expect(await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE))).toMatchObject({
      status: 401,
      code: 'operator_code_invalid',
    });
    await firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR));
    await firstValueFrom(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE));
    expect((await firstValueFrom(mock.me())).adminTier).toBe('operator');
    await firstValueFrom(mock.logout());
    expect((await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE))).status).toBe(
      401,
    );
  });

  it('kills a code after five wrong guesses, like Core, until a new one is requested', async () => {
    const mock = gateway();
    await firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR));
    for (let i = 0; i < 5; i++) await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, '111111'));
    expect((await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE))).status).toBe(
      401,
    );
    await firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR));
    await expect(
      firstValueFrom(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE)),
    ).resolves.toBeUndefined();
  });

  it('signs in the phone-only operator with no email', async () => {
    const mock = gateway();
    await firstValueFrom(mock.requestWorkingCode(PHONE_OPERATOR));
    await firstValueFrom(mock.verifyWorkingCode(PHONE_OPERATOR, DEMO_WORKING_CODE));
    expect(await firstValueFrom(mock.me())).toMatchObject({ email: null, phone: '+99900000001' });
    expect((await firstValueFrom(mock.grants())).platformAssignments).toEqual([
      DEMO_DRIVE_PLATFORM_ID,
    ]);
    expect(await firstValueFrom(mock.platformAccess(DEMO_DRIVE_PLATFORM_ID))).toBe(true);
  });

  it('simulates the rate-limited and unavailable scenarios', async () => {
    const mock = gateway();
    const at = (name: string): OperatorIdentifier => ({
      kind: 'email',
      email: `operator.${name}@demo.nawara.invalid`,
    });
    expect((await error(mock.requestWorkingCode(at('busy')))).status).toBe(429);
    await firstValueFrom(mock.requestWorkingCode(at('limited')));
    expect((await error(mock.verifyWorkingCode(at('limited'), DEMO_WORKING_CODE))).status).toBe(
      429,
    );
    await firstValueFrom(mock.requestWorkingCode(at('offline')));
    expect((await error(mock.verifyWorkingCode(at('offline'), DEMO_WORKING_CODE))).kind).toBe(
      'unavailable',
    );
  });
});
