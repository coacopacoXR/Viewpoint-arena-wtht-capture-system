import { describe, expect, it } from 'vitest';
import {
  buildExtractionUserPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  upcomingDays,
  weekdayOf,
} from './extractionPrompt';

const chunk = { speakerId: 'speaker-1', text: 'Ship it by Friday.', startMs: 0, endMs: 4000 };

describe('buildExtractionUserPrompt', () => {
  it("puts today's date and weekday first, then the agenda line", () => {
    const prompt = buildExtractionUserPrompt(
      [chunk],
      { agendaIdx: 2, slideTitle: 'Bracket' },
      '2026-09-21',
    );
    const lines = prompt.split('\n');
    expect(lines[0]).toBe("Today's date: 2026-09-21 (Monday)");
    expect(lines[1]).toBe(`Next 14 days: ${upcomingDays('2026-09-21', 14)}`);
    expect(lines[2]).toBe('Agenda item 2: Bracket');
  });

  it('lists the next two weeks so "by Friday" is a lookup, not arithmetic', () => {
    const days = upcomingDays('2026-09-21', 14).split(', ');
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('Tuesday 2026-09-22');
    expect(days).toContain('Friday 2026-09-25');
    expect(days[13]).toBe('Monday 2026-10-05');
    expect(upcomingDays('nope', 3)).toBe('unknown');
  });

  it("defaults to today's UTC date", () => {
    const prompt = buildExtractionUserPrompt([chunk], { agendaIdx: 0, slideTitle: 'x' });
    const today = new Date().toISOString().slice(0, 10);
    expect(prompt.split('\n')[0]).toBe(`Today's date: ${today} (${weekdayOf(today)})`);
  });

  it('names the weekday the same way in every locale and timezone', () => {
    expect(weekdayOf('2026-09-21')).toBe('Monday');
    expect(weekdayOf('2026-09-25')).toBe('Friday');
    expect(weekdayOf('2024-02-29')).toBe('Thursday');
    expect(weekdayOf('not-a-date')).toBe('unknown');
  });

  it('tells the model to resolve relative deadlines against that date', () => {
    // A live run without this turned "by Friday" into 2023-10-06.
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("against today's date");
  });
});
