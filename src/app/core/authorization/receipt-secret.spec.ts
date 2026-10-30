import { ReceiptSecret } from './receipt-secret';
import { ReceiptSecretUnavailableError, revealReceiptSecret } from './receipt-secret-access';

/** A syntactically valid, fictional secret (base64url, 43 characters). Never a real Core value. */
const VALUE = 'TEST-only_receipt-secret_0123456789abcdefgh';

describe('ReceiptSecret (F1-S3)', () => {
  it('holds a Core-shaped value and lets the access module read it', () => {
    expect(VALUE).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const secret = ReceiptSecret.fromIssued(VALUE);
    expect(secret.held).toBe(true);
    expect(revealReceiptSecret(secret)).toBe(VALUE);
  });

  it('never shows the value in string, template, JSON or inspection representations', () => {
    const secret = ReceiptSecret.fromIssued(VALUE);
    const nodeInspect = Symbol.for('nodejs.util.inspect.custom');
    const inspect = Reflect.get(secret, nodeInspect) as () => string;
    const renderings = [
      String(secret),
      `${secret}`,
      secret.toString(),
      JSON.stringify(secret),
      JSON.stringify({ receipt: { secret } }),
      inspect.call(secret),
    ];
    for (const rendering of renderings) {
      expect(rendering).not.toContain(VALUE);
      expect(rendering).toContain('[receipt secret]');
    }
  });

  it('keeps no own property that holds the value, and cannot be extended', () => {
    const secret = ReceiptSecret.fromIssued(VALUE);
    for (const key of Reflect.ownKeys(secret)) expect(Reflect.get(secret, key)).not.toBe(VALUE);
    expect(Object.values(secret)).not.toContain(VALUE);
    expect(Object.isFrozen(secret)).toBe(true);
    expect(() => Object.defineProperty(secret, 'leak', { value: 1 })).toThrow(TypeError);
  });

  it('stops every extraction once discarded, idempotently, with an error that carries no part of it', () => {
    const secret = ReceiptSecret.fromIssued(VALUE);
    secret.discard();
    secret.discard();
    expect(secret.held).toBe(false);
    let thrown: unknown = null;
    try {
      revealReceiptSecret(secret);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReceiptSecretUnavailableError);
    expect(String(thrown)).not.toContain(VALUE);
    expect(JSON.stringify(thrown)).not.toContain(VALUE);
  });

  it('refuses a malformed value without echoing it', () => {
    const malformed = 'not a secret: value-that-must-not-echo';
    expect(() => ReceiptSecret.fromIssued(malformed)).toThrow(TypeError);
    try {
      ReceiptSecret.fromIssued(malformed);
    } catch (error) {
      expect(String(error)).not.toContain(malformed);
    }
  });

  it('never stores or logs the value while held, read and discarded', () => {
    // Other spec files share this browser environment and may leave their own keys: compare before and after.
    const keys = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, i) => storage.key(i));
    const before = [keys(globalThis.localStorage), keys(globalThis.sessionStorage)];
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method),
    );
    const secret = ReceiptSecret.fromIssued(VALUE);
    revealReceiptSecret(secret);
    secret.discard();
    expect(local).not.toHaveBeenCalled();
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect([keys(globalThis.localStorage), keys(globalThis.sessionStorage)]).toEqual(before);
    vi.restoreAllMocks();
  });

  it('isolates holders: discarding one leaves another intact', () => {
    const first = ReceiptSecret.fromIssued(VALUE);
    const second = ReceiptSecret.fromIssued(VALUE.replace('TEST', 'TSET'));
    first.discard();
    expect(second.held).toBe(true);
    expect(revealReceiptSecret(second)).toBe(VALUE.replace('TEST', 'TSET'));
  });
});
