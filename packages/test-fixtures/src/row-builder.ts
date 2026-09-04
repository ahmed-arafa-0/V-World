import { TAB_REGISTRY, isTableTab, type TabName } from '@veoullas-world/sheet-schema';

export function headerFor(tab: Exclude<TabName, '00_README'>): string[] {
  const def = TAB_REGISTRY[tab];
  if (!isTableTab(def)) throw new Error(`"${tab}" is not a table tab`);
  return def.columns.map((c) => c.name);
}

/** Builds a header-ordered row array from a { columnName: value } object, defaulting missing keys to ''. */
export function row(tab: Exclude<TabName, '00_README'>, values: Record<string, string>): string[] {
  return headerFor(tab).map((col) => values[col] ?? '');
}
