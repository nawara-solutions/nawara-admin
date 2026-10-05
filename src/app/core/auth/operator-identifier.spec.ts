import { identifierText, parseOperatorIdentifier } from './operator-identifier';

describe('parseOperatorIdentifier', () => {
  it('accepts an email address, trimmed and lower-cased', () => {
    expect(parseOperatorIdentifier('  Operator@Demo.Nawara.INVALID ')).toEqual({
      kind: 'email',
      email: 'operator@demo.nawara.invalid',
    });
  });

  it('does not take any text with an @ for an email address', () => {
    expect(parseOperatorIdentifier('operator@')).toBeNull();
    expect(parseOperatorIdentifier('@demo.invalid')).toBeNull();
    expect(parseOperatorIdentifier('operator@demo')).toBeNull();
    expect(parseOperatorIdentifier('a b@demo.invalid')).toBeNull();
  });

  it('accepts a phone number with spaces, brackets and dashes, normalized as Core does', () => {
    expect(parseOperatorIdentifier('+999 (00) 000-0001')).toEqual({
      kind: 'phone',
      phone: '+999000000001',
    });
    expect(parseOperatorIdentifier('99900000001')).toEqual({ kind: 'phone', phone: '99900000001' });
  });

  it('refuses phone numbers outside 8 to 15 digits, letters and a misplaced +', () => {
    expect(parseOperatorIdentifier('000 000')).toBeNull();
    expect(parseOperatorIdentifier('+1234567890123456')).toBeNull();
    expect(parseOperatorIdentifier('0800-CALL-NOW')).toBeNull();
    expect(parseOperatorIdentifier('12+34567890')).toBeNull();
    expect(parseOperatorIdentifier('   ')).toBeNull();
  });

  it('shows the identifier back as its normalized value', () => {
    expect(identifierText({ kind: 'phone', phone: '+999000000001' })).toBe('+999000000001');
    expect(identifierText({ kind: 'email', email: 'operator@demo.nawara.invalid' })).toBe(
      'operator@demo.nawara.invalid',
    );
  });
});
