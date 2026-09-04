import type { ColumnDefinition, ColumnKind } from '../types.js';

export function c(
  name: string,
  kind: ColumnKind,
  extra?: Partial<ColumnDefinition>,
): ColumnDefinition {
  return { name, kind, ...extra };
}
