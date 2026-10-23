import { PLATFORM_NAME_MAX, isolated, platformNameProblem } from './create-platform.model';

describe('Create platform model', () => {
  it('checks the trimmed name against Core’s documented 1–200 bound', () => {
    expect(platformNameProblem('   ')).toBe('required');
    expect(platformNameProblem('x'.repeat(PLATFORM_NAME_MAX + 1))).toBe('tooLong');
    expect(platformNameProblem(` ${'x'.repeat(PLATFORM_NAME_MAX)} `)).toBeNull();
  });

  it('isolates a name inside a translated sentence', () => {
    expect(isolated('Nawara Academy')).toBe('\u2068Nawara Academy\u2069');
  });
});
