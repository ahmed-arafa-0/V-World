import type { TableTabDefinition } from './types.js';
import {
  isBlank,
  isPlaceholder,
  normalizeBoolean,
  normalizeCsv,
  normalizeDate,
  normalizeInteger,
  normalizeJson,
  normalizeNumber,
} from './normalize.js';

export type RowIssueCode =
  | 'BLANK_REQUIRED_ID'
  | 'DUPLICATE_PRIMARY_KEY'
  | 'INVALID_BOOLEAN'
  | 'INVALID_INTEGER'
  | 'INVALID_NUMBER'
  | 'INVALID_JSON'
  | 'INVALID_DATE'
  | 'INVALID_CONTROLLED_VALUE'
  | 'PLACEHOLDER_VALUE';

export interface RowIssue {
  rowIndex: number;
  rowId: string | null;
  column: string;
  code: RowIssueCode;
  message: string;
}

export interface NormalizedRow {
  rowIndex: number;
  primaryKeyValue: string | null;
  /** Original string cell values keyed by column name, including any unknown/extra columns. */
  raw: Record<string, string>;
  /** Normalized values: booleans/numbers are real types, dates are ISO strings, csv is string[], json is parsed. */
  values: Record<string, unknown>;
}

export interface ParseTabResult {
  missingColumns: string[];
  unknownColumns: string[];
  rows: NormalizedRow[];
  issues: RowIssue[];
  duplicatePrimaryKeyValues: string[];
  placeholderCount: number;
}

function isEntirelyBlankRow(row: string[]): boolean {
  return row.every((cell) => isBlank(cell));
}

export function parseTab(
  def: TableTabDefinition,
  headerRow: string[],
  dataRows: string[][],
  validationLists: Record<string, Set<string>>,
): ParseTabResult {
  const declaredColumns = def.columns.map((c) => c.name);
  const missingColumns = declaredColumns.filter((name) => !headerRow.includes(name));
  const unknownColumns = headerRow.filter((name) => name && !declaredColumns.includes(name));

  const columnIndex = new Map<string, number>();
  headerRow.forEach((name, idx) => {
    if (name) columnIndex.set(name, idx);
  });

  const issues: RowIssue[] = [];
  const rows: NormalizedRow[] = [];
  const seenPrimaryKeys = new Map<string, number>();
  const duplicatePrimaryKeyValues: string[] = [];
  let placeholderCount = 0;

  dataRows.forEach((rawRowValues, i) => {
    if (isEntirelyBlankRow(rawRowValues)) return;

    const rowIndex = i + 1;
    const raw: Record<string, string> = {};
    headerRow.forEach((name, colIdx) => {
      if (name) raw[name] = rawRowValues[colIdx] ?? '';
    });

    const values: Record<string, unknown> = {};

    for (const colDef of def.columns) {
      const cell = raw[colDef.name] ?? '';

      if (isPlaceholder(cell)) {
        placeholderCount += 1;
        issues.push({
          rowIndex,
          rowId: null,
          column: colDef.name,
          code: 'PLACEHOLDER_VALUE',
          message: `Column "${colDef.name}" still contains an un-replaced placeholder value.`,
        });
        values[colDef.name] = cell;
        continue;
      }

      switch (colDef.kind) {
        case 'boolean': {
          if (isBlank(cell)) {
            values[colDef.name] = null;
            break;
          }
          const result = normalizeBoolean(cell);
          if (!result.ok) {
            issues.push({
              rowIndex,
              rowId: null,
              column: colDef.name,
              code: 'INVALID_BOOLEAN',
              message: `Column "${colDef.name}" is not a recognized boolean value.`,
            });
            values[colDef.name] = cell;
          } else {
            values[colDef.name] = result.value;
          }
          break;
        }
        case 'integer': {
          if (isBlank(cell)) {
            values[colDef.name] = null;
            break;
          }
          const result = normalizeInteger(cell);
          if (!result.ok) {
            issues.push({
              rowIndex,
              rowId: null,
              column: colDef.name,
              code: 'INVALID_INTEGER',
              message: `Column "${colDef.name}" is not a valid integer.`,
            });
            values[colDef.name] = cell;
          } else {
            values[colDef.name] = result.value;
          }
          break;
        }
        case 'number': {
          if (isBlank(cell)) {
            values[colDef.name] = null;
            break;
          }
          const result = normalizeNumber(cell);
          if (!result.ok) {
            issues.push({
              rowIndex,
              rowId: null,
              column: colDef.name,
              code: 'INVALID_NUMBER',
              message: `Column "${colDef.name}" is not a valid number.`,
            });
            values[colDef.name] = cell;
          } else {
            values[colDef.name] = result.value;
          }
          break;
        }
        case 'json': {
          const result = normalizeJson(cell);
          if (!result.ok) {
            issues.push({
              rowIndex,
              rowId: null,
              column: colDef.name,
              code: 'INVALID_JSON',
              message: `Column "${colDef.name}" is not valid JSON.`,
            });
            values[colDef.name] = cell;
          } else {
            values[colDef.name] = result.value;
          }
          break;
        }
        case 'date': {
          if (isBlank(cell)) {
            values[colDef.name] = null;
            break;
          }
          const result = normalizeDate(cell);
          if (!result.ok) {
            issues.push({
              rowIndex,
              rowId: null,
              column: colDef.name,
              code: 'INVALID_DATE',
              message: `Column "${colDef.name}" is not a recognized date/datetime value.`,
            });
            values[colDef.name] = cell;
          } else {
            values[colDef.name] = result.value;
          }
          break;
        }
        case 'csv': {
          values[colDef.name] = normalizeCsv(cell);
          break;
        }
        case 'id':
        case 'text':
        default: {
          values[colDef.name] = cell;
          break;
        }
      }

      if (colDef.controlledList && !isBlank(cell)) {
        const allowed = validationLists[colDef.controlledList];
        if (allowed && !allowed.has(cell)) {
          issues.push({
            rowIndex,
            rowId: null,
            column: colDef.name,
            code: 'INVALID_CONTROLLED_VALUE',
            message: `Column "${colDef.name}" value is not in the "${colDef.controlledList}" controlled list.`,
          });
        }
      }
    }

    // Preserve genuinely unknown columns (present live but not in our registry) verbatim.
    for (const unknownName of unknownColumns) {
      values[unknownName] = raw[unknownName] ?? '';
    }

    const primaryKeyValue = def.derivedPrimaryKey
      ? def.derivedPrimaryKey(raw)
      : def.primaryKey
        ? (raw[def.primaryKey] ?? '')
        : null;

    if (primaryKeyValue !== null) {
      if (isBlank(primaryKeyValue)) {
        issues.push({
          rowIndex,
          rowId: null,
          column: def.primaryKey ?? '(derived key)',
          code: 'BLANK_REQUIRED_ID',
          message: 'Primary key is blank for this row.',
        });
      } else if (seenPrimaryKeys.has(primaryKeyValue)) {
        duplicatePrimaryKeyValues.push(primaryKeyValue);
        issues.push({
          rowIndex,
          rowId: primaryKeyValue,
          column: def.primaryKey ?? '(derived key)',
          code: 'DUPLICATE_PRIMARY_KEY',
          message: 'Primary key value is used by more than one row.',
        });
      } else {
        seenPrimaryKeys.set(primaryKeyValue, rowIndex);
      }
    }

    // Attach rowId now that it is resolved, for issues raised earlier in this iteration.
    for (const issue of issues) {
      if (
        issue.rowIndex === rowIndex &&
        issue.rowId === null &&
        primaryKeyValue &&
        !isBlank(primaryKeyValue)
      ) {
        issue.rowId = primaryKeyValue;
      }
    }

    rows.push({ rowIndex, primaryKeyValue: primaryKeyValue || null, raw, values });
  });

  return {
    missingColumns,
    unknownColumns,
    rows,
    issues,
    duplicatePrimaryKeyValues,
    placeholderCount,
  };
}
