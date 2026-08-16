import { describe, it, expect } from 'vitest';
import { parseSplitExpression, generateEveryPageGroups } from '../engine/splitParser';

describe('Split Parser & Validator', () => {
  it('parses valid simple single pages and ranges', () => {
    const res = parseSplitExpression('1-3; 4,6; 7-9', 10);
    expect(res.isValid).toBe(true);
    expect(res.groups).toEqual([
      [0, 1, 2],
      [3, 5],
      [6, 7, 8],
    ]);
    expect(res.userGroups).toEqual([
      [1, 2, 3],
      [4, 6],
      [7, 8, 9],
    ]);
  });

  it('generates Every Page groups correctly', () => {
    const res = generateEveryPageGroups(4);
    expect(res.isValid).toBe(true);
    expect(res.groups).toEqual([[0], [1], [2], [3]]);
    expect(res.userGroups).toEqual([[1], [2], [3], [4]]);
  });

  it('rejects empty expressions', () => {
    const res = parseSplitExpression('', 5);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/cannot be empty/i);
  });

  it('rejects page 0', () => {
    const res = parseSplitExpression('0-2', 5);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Page 0 is invalid/i);

    const res2 = parseSplitExpression('0,1,2', 5);
    expect(res2.isValid).toBe(false);
    expect(res2.error).toMatch(/Page 0 is invalid/i);
  });

  it('rejects reversed ranges', () => {
    const res = parseSplitExpression('5-2', 10);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Reversed range/i);
  });

  it('rejects out of bounds pages', () => {
    const res = parseSplitExpression('1-12', 10);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/exceeds document total pages/i);
  });

  it('rejects duplicates inside the same output group', () => {
    const res = parseSplitExpression('1,2,2,3', 10);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Duplicate page 2/i);
  });

  it('rejects empty groups created by consecutive semicolons', () => {
    const res = parseSplitExpression('1-2;;3-4', 10);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/Group 2 is empty/i);
  });

  it('tolerates surrounding and interior whitespace', () => {
    const res = parseSplitExpression('  1 - 3 ;  4 , 6  ', 10);
    expect(res.isValid).toBe(true);
    expect(res.groups).toEqual([
      [0, 1, 2],
      [3, 5],
    ]);
  });

  it('accepts a single-page range and a single group', () => {
    expect(parseSplitExpression('2-2', 5).groups).toEqual([[1]]);
    expect(parseSplitExpression('3', 5).groups).toEqual([[2]]);
  });

  it('preserves the order pages are written in, without sorting', () => {
    const res = parseSplitExpression('5,1,3', 10);
    expect(res.isValid).toBe(true);
    expect(res.groups).toEqual([[4, 0, 2]]);
    expect(res.userGroups).toEqual([[5, 1, 3]]);
  });

  it('allows the same page in two different output groups', () => {
    const res = parseSplitExpression('1-2;2-3', 5);
    expect(res.isValid).toBe(true);
    expect(res.groups).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('rejects malformed ranges', () => {
    expect(parseSplitExpression('1-2-3', 10).error).toMatch(/Invalid range/i);
    expect(parseSplitExpression('-3', 10).error).toMatch(/positive integers/i);
    expect(parseSplitExpression('3-', 10).error).toMatch(/positive integers/i);
  });

  it('rejects non-numeric and decimal page tokens', () => {
    expect(parseSplitExpression('a', 10).error).toMatch(/Invalid page number/i);
    expect(parseSplitExpression('1.5', 10).error).toMatch(/Invalid page number/i);
    expect(parseSplitExpression('1,,2', 10).error).toMatch(/Empty page entry/i);
  });

  it('rejects a whitespace-only expression', () => {
    expect(parseSplitExpression('   ', 10).error).toMatch(/cannot be empty/i);
  });

  it('returns no groups whenever the expression is invalid', () => {
    const res = parseSplitExpression('1-99', 10);
    expect(res.isValid).toBe(false);
    expect(res.groups).toEqual([]);
    expect(res.userGroups).toEqual([]);
  });

  it('generates an empty every-page plan for a zero-page document', () => {
    expect(generateEveryPageGroups(0).groups).toEqual([]);
  });
});
