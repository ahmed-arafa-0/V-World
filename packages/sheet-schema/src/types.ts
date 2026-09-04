import type { TabName } from './tab-names.js';

export type ColumnKind = 'id' | 'text' | 'boolean' | 'integer' | 'number' | 'csv' | 'json' | 'date';

export type Sensitivity = 'Internal' | 'DEV_ONLY plaintext' | 'Private personal';

export interface ColumnDefinition {
  name: string;
  kind: ColumnKind;
  /** Name of a `list_name` in 39_VALIDATION_LISTS this column's value must belong to, when non-blank. */
  controlledList?: string;
  /**
   * Hard sensitivity override for specific columns whose tab-level sensitivity
   * is not strict enough on its own (e.g. plaintext credential columns).
   * Schema-health diagnostics must never surface the value of such a column.
   */
  sensitive?: boolean;
}

export interface RelationshipDefinition {
  fromTab: TabName;
  fromColumn: string;
  toTab: TabName;
  toColumn: string;
  /** The fromColumn is a CSV list of foreign IDs rather than a single ID. */
  isCsv?: boolean;
  /** A blank value in fromColumn is allowed and not checked (e.g. optional references). */
  allowBlank?: boolean;
}

export interface TableTabDefinition {
  name: TabName;
  kind: 'table';
  purpose: string;
  /** Literal primary key column name, or null when the tab has no per-row primary key (should not normally happen for table tabs). */
  primaryKey: string | null;
  /**
   * Only set for tabs whose declared primary key (see 38_DATA_DICTIONARY) is not
   * a literal column but a composite of other columns (currently only
   * 39_VALIDATION_LISTS, whose key is `list_name` + `value`).
   */
  derivedPrimaryKey?: (row: Record<string, string>) => string;
  columns: ColumnDefinition[];
  sensitivity: Sensitivity;
  readBy: string;
  writeBy: string;
  adminEditable: boolean;
  notes?: string;
}

export interface ReadmeTabDefinition {
  name: '00_README';
  kind: 'readme';
  purpose: string;
  sensitivity: Sensitivity;
  readBy: string;
  writeBy: string;
  adminEditable: boolean;
  notes?: string;
}

export type TabDefinition = TableTabDefinition | ReadmeTabDefinition;

export function isTableTab(def: TabDefinition): def is TableTabDefinition {
  return def.kind === 'table';
}
