/**
 * Builds a { list_name -> Set<allowed value> } map from raw 39_VALIDATION_LISTS
 * rows (header + data). A value counts as known whether or not its own row is
 * currently enabled — disabling a list entry deprecates it for new choices,
 * it does not retroactively invalidate existing data that already used it.
 */
export function buildValidationListSets(
  headerRow: string[],
  dataRows: string[][],
): Record<string, Set<string>> {
  const nameIdx = headerRow.indexOf('list_name');
  const valueIdx = headerRow.indexOf('value');
  const sets: Record<string, Set<string>> = {};

  if (nameIdx === -1 || valueIdx === -1) return sets;

  for (const row of dataRows) {
    const listName = row[nameIdx];
    const value = row[valueIdx];
    if (!listName || value === undefined || value === '') continue;
    if (!sets[listName]) sets[listName] = new Set();
    sets[listName]!.add(value);
  }

  return sets;
}
