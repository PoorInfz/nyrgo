import { describe, expect, it } from 'vitest';
import { nearToYocto, yoctoToNear } from '../src/near/tx';

describe('NEAR amounts', () => {
  it('reads prices typed by players', () => {
    expect(nearToYocto('1')).toBe('1000000000000000000000000');
    expect(nearToYocto('2,5')).toBe('2500000000000000000000000');
    expect(nearToYocto(' 0.01 ')).toBe('10000000000000000000000');
    expect(nearToYocto('0')).toBeNull();
    expect(nearToYocto('abc')).toBeNull();
    expect(nearToYocto('1.1234567')).toBeNull();
  });
  it('shows amounts', () => {
    expect(yoctoToNear('1500000000000000000000000')).toBe('1.5');
    expect(yoctoToNear('5000000000000000000000')).toBe('0.005');
    expect(yoctoToNear('2000000000000000000000000')).toBe('2');
  });
});
