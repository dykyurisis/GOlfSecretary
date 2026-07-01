import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTeeSheet } from '../src/invited/parseTeeSheet';

const html = readFileSync(fileURLToPath(new URL('./fixtures/teesheet.html', import.meta.url)), 'utf8');

describe('parseTeeSheet', () => {
  it('extracts all tee-time rows', () => {
    const slots = parseTeeSheet(html);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual({ club: 'Coto De Caza Golf & Racquet Club', course: 'SOUTH COURSE', date: 'Tue 06/30', time: '02:20 PM', slotsAvailable: 2 });
  });

  it('parses slot counts as numbers', () => {
    const slots = parseTeeSheet(html);
    expect(slots.map(s => s.slotsAvailable)).toEqual([2, 0, 3]);
  });

  it('filters available + a given mm/dd date via helper', () => {
    const slots = parseTeeSheet(html);
    const open = slots.filter(s => s.slotsAvailable > 0 && s.date.endsWith('07/07'));
    expect(open).toHaveLength(1);
    expect(open[0].course).toBe('NORTH COURSE');
  });
});
