import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTeeSheet, parseGridRow } from '../src/invited/parseTeeSheet';

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

// The "Available Tee Times" grid (per date tab + course) — each row's textContent
// looks like "07:20 AM NORTH COURSEThu 07/2307:20 AM3" (no separators between cells).
describe('parseGridRow', () => {
  it('parses an available NORTH row', () => {
    expect(parseGridRow('07:20 AM NORTH COURSEThu 07/2307:20 AM3')).toEqual({
      club: 'Coto de Caza Golf & Racquet Club',
      course: 'NORTH COURSE',
      date: 'Thu 07/23',
      time: '07:20 AM',
      slotsAvailable: 3,
    });
  });

  it('parses a full (0-slot) row', () => {
    expect(parseGridRow('07:00 AM NORTH COURSEThu 07/2307:00 AM0')?.slotsAvailable).toBe(0);
  });

  it('parses a SOUTH afternoon row', () => {
    const s = parseGridRow('01:40 PM SOUTH COURSEThu 07/2301:40 PM4');
    expect(s?.course).toBe('SOUTH COURSE');
    expect(s?.time).toBe('01:40 PM');
    expect(s?.date).toBe('Thu 07/23');
    expect(s?.slotsAvailable).toBe(4);
  });

  it('returns null for header/spacer rows (no tee time)', () => {
    expect(parseGridRow('Reserve Multigrab Course Name Play Date Tee Time Player Slots Available')).toBeNull();
    expect(parseGridRow('')).toBeNull();
    expect(parseGridRow(' ')).toBeNull();
  });
});
