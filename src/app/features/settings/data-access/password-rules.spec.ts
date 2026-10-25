import { PASSWORD_LIMITS, checkPassword } from './password-rules';

describe('password limits (P9-S4e; Core’s documented limits only)', () => {
  it('10 to 72 characters', () => {
    expect(checkPassword('a'.repeat(9)).ok).toBe(false);
    expect(checkPassword('a'.repeat(10)).ok).toBe(true);
    expect(checkPassword('a'.repeat(72)).ok).toBe(true);
    expect(checkPassword('a'.repeat(73))).toMatchObject({ lengthOk: false, bytesOk: false });
    expect(checkPassword('')).toMatchObject({ characters: 0, ok: false });
  });

  it('counts characters as code points and bytes as UTF-8 (an emoji is 1 character, 4 bytes)', () => {
    const emoji = '😀';
    expect(emoji.length).toBe(2);
    expect(checkPassword(emoji.repeat(10))).toMatchObject({ characters: 10, bytes: 40, ok: true });
    expect(checkPassword(emoji.repeat(18))).toMatchObject({ characters: 18, bytes: 72, ok: true });
    expect(checkPassword(emoji.repeat(19))).toMatchObject({ bytes: 76, bytesOk: false, ok: false });
    // a two-byte letter: 36 fit, 37 do not, although both are well under 72 characters
    expect(checkPassword('é'.repeat(36))).toMatchObject({ bytes: 72, ok: true });
    expect(checkPassword('é'.repeat(37))).toMatchObject({ lengthOk: true, bytesOk: false });
    // 9 characters but 36 bytes: still too short
    expect(checkPassword(emoji.repeat(9))).toMatchObject({ lengthOk: false, bytesOk: true });
  });

  it('refuses a NUL character and an unpaired surrogate; spaces count and nothing is trimmed', () => {
    expect(checkPassword(`abcdefghij\u0000`)).toMatchObject({ charactersOk: false, ok: false });
    expect(checkPassword(`abcdefghij\uD83D`)).toMatchObject({ charactersOk: false, ok: false });
    expect(checkPassword(`abcdefghij\uDE00`)).toMatchObject({ charactersOk: false, ok: false });
    expect(checkPassword('  abcdefg ')).toMatchObject({ characters: 10, ok: true });
    expect(checkPassword(' '.repeat(10)).ok).toBe(true);
  });

  it('declares only Core’s limits', () => {
    expect(PASSWORD_LIMITS).toEqual({ minCharacters: 10, maxCharacters: 72, maxBytes: 72 });
  });
});
