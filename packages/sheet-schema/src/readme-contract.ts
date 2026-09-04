/**
 * 00_README is a hand-authored dashboard/metadata sheet, not a normalized row
 * table — it has no header row or primary key. This parser locates its
 * sections by marker text rather than fixed row offsets, so small edits
 * (an added blank line, a reworded rule) don't break parsing.
 */

export interface ReadmeCounts {
  locations: number | null;
  storyBeats: number | null;
  keyInventory: number | null;
  unreadMessages: number | null;
  configuredEvents: number | null;
}

export interface ReadmeListItem {
  index: string;
  text: string;
}

export interface ReadmeTabCatalogEntry {
  index: string;
  tabName: string;
  description: string;
}

export interface ReadmeDashboard {
  title: string;
  tagline: string;
  workbookVersion: string;
  status: string;
  languagesCount: number | null;
  targetTimezone: string;
  birthdayDate: string;
  counts: ReadmeCounts;
  operatingRules: ReadmeListItem[];
  implementationOrder: ReadmeListItem[];
  tabCatalog: ReadmeTabCatalogEntry[];
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function readLabelValuePairs(row: string[]): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (let i = 0; i + 1 < row.length; i += 2) {
    const label = row[i]?.trim();
    const value = row[i + 1] ?? '';
    if (label) pairs[label] = value;
  }
  return pairs;
}

export function parseReadmeSheet(rows: string[][]): ReadmeDashboard {
  const title = rows[0]?.[0] ?? '';
  const tagline =
    rows
      .slice(1, 4)
      .map((r) => r[0])
      .find((v) => v && v.includes('•')) ?? '';

  const summaryRowIndex = rows.findIndex((r) => r[0] === 'Workbook version');
  const summary = summaryRowIndex >= 0 ? readLabelValuePairs(rows[summaryRowIndex]!) : {};

  const countsLabelIndex = rows.findIndex((r) => r[0] === 'Locations');
  const countsLabels = countsLabelIndex >= 0 ? rows[countsLabelIndex]! : [];
  const countsValues = countsLabelIndex >= 0 ? (rows[countsLabelIndex + 1] ?? []) : [];
  const countsByLabel: Record<string, string> = {};
  for (let i = 0; i < countsLabels.length; i++) {
    const label = countsLabels[i]?.trim();
    if (label) countsByLabel[label] = countsValues[i] ?? '';
  }

  const operatingRulesStart = rows.findIndex((r) => r[0] === 'Operating rules');
  const tabCatalogStart = rows.findIndex(
    (r) => typeof r[0] === 'string' && r[0].startsWith('Tab catalog'),
  );

  const operatingRules: ReadmeListItem[] = [];
  const implementationOrder: ReadmeListItem[] = [];

  if (operatingRulesStart >= 0) {
    const end = tabCatalogStart >= 0 ? tabCatalogStart : rows.length;
    for (let i = operatingRulesStart + 1; i < end; i++) {
      const row = rows[i] ?? [];
      if (row[0] && row[1]) {
        operatingRules.push({ index: row[0], text: row[1] });
      }
      if (row[3] && row[3] !== '' && row[3] !== 'Implementation order') {
        implementationOrder.push({ index: row[3], text: row[4] ?? '' });
      }
    }
  }

  const tabCatalog: ReadmeTabCatalogEntry[] = [];
  if (tabCatalogStart >= 0) {
    for (let i = tabCatalogStart + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (row[0] && row[1]) {
        tabCatalog.push({ index: row[0], tabName: row[1], description: row[2] ?? '' });
      }
    }
  }

  return {
    title,
    tagline,
    workbookVersion: summary['Workbook version'] ?? '',
    status: summary['Status'] ?? '',
    languagesCount: toNumberOrNull(summary['Languages']),
    targetTimezone: summary['Target timezone'] ?? '',
    birthdayDate: summary['Birthday'] ?? '',
    counts: {
      locations: toNumberOrNull(countsByLabel['Locations']),
      storyBeats: toNumberOrNull(countsByLabel['Story beats']),
      keyInventory: toNumberOrNull(countsByLabel['Key inventory']),
      unreadMessages: toNumberOrNull(countsByLabel['Unread messages']),
      configuredEvents: toNumberOrNull(countsByLabel['Configured events']),
    },
    operatingRules,
    implementationOrder,
    tabCatalog,
  };
}
