import { describe, expect, it } from 'vitest';
import { parseReadmeSheet } from '../src/readme-contract.js';

const SAMPLE_README: string[][] = [
  ["Veoulla's World — Google Sheets Data Blueprint"],
  [],
  ['Prototype architecture • Sheets = authoritative data'],
  [],
  [
    'Workbook version',
    '0.2',
    'Status',
    'Blueprint',
    'Languages',
    '5',
    'Target timezone',
    'Africa/Cairo',
    'Birthday',
    '2026-09-26',
  ],
  [],
  [
    'Locations',
    '',
    'Story beats',
    '',
    'Key inventory',
    '',
    'Unread messages',
    '',
    'Configured events',
  ],
  ['8', '', '18', '', '0', '', '1', '', '1'],
  [],
  ['Operating rules'],
  ['1', 'Rule one text', '', 'Implementation order'],
  ['2', 'Rule two text', '', '1', 'Step one text'],
  ['3', 'Rule three text', '', '2', 'Step two text'],
  [],
  ['Tab catalog — see 38_DATA_DICTIONARY for complete ownership and integration notes'],
  ['1', '00_README', 'Workbook map'],
  ['2', '01_APP_CONFIG', 'Global editable application settings'],
];

describe('parseReadmeSheet', () => {
  it('parses the title, tagline, and summary fields', () => {
    const dashboard = parseReadmeSheet(SAMPLE_README);
    expect(dashboard.title).toBe("Veoulla's World — Google Sheets Data Blueprint");
    expect(dashboard.tagline).toContain('authoritative data');
    expect(dashboard.workbookVersion).toBe('0.2');
    expect(dashboard.status).toBe('Blueprint');
    expect(dashboard.languagesCount).toBe(5);
    expect(dashboard.targetTimezone).toBe('Africa/Cairo');
    expect(dashboard.birthdayDate).toBe('2026-09-26');
  });

  it('parses the two-row summary count block', () => {
    const dashboard = parseReadmeSheet(SAMPLE_README);
    expect(dashboard.counts).toEqual({
      locations: 8,
      storyBeats: 18,
      keyInventory: 0,
      unreadMessages: 1,
      configuredEvents: 1,
    });
  });

  it('parses operating rules and the implementation-order side list', () => {
    const dashboard = parseReadmeSheet(SAMPLE_README);
    expect(dashboard.operatingRules).toEqual([
      { index: '1', text: 'Rule one text' },
      { index: '2', text: 'Rule two text' },
      { index: '3', text: 'Rule three text' },
    ]);
    expect(dashboard.implementationOrder).toEqual([
      { index: '1', text: 'Step one text' },
      { index: '2', text: 'Step two text' },
    ]);
  });

  it('parses the tab catalog', () => {
    const dashboard = parseReadmeSheet(SAMPLE_README);
    expect(dashboard.tabCatalog).toEqual([
      { index: '1', tabName: '00_README', description: 'Workbook map' },
      { index: '2', tabName: '01_APP_CONFIG', description: 'Global editable application settings' },
    ]);
  });

  it('does not throw on an empty or malformed sheet', () => {
    expect(() => parseReadmeSheet([])).not.toThrow();
    const dashboard = parseReadmeSheet([]);
    expect(dashboard.title).toBe('');
    expect(dashboard.counts.locations).toBeNull();
  });
});
