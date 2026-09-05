import {
  EXPECTED_TAB_COUNT,
  RELATIONSHIPS,
  TABLE_TAB_NAMES,
  TAB_NAMES,
  TAB_REGISTRY,
  isTableTab,
  type TabName,
} from '@veoullas-world/sheet-schema';
import type {
  SchemaHealthDiagnostic,
  SchemaHealthResponse,
  SchemaHealthStatus,
  SchemaHealthTabSummary,
} from '@veoullas-world/contracts';
import type { ReadOptions, SheetGateway } from '../repositories/sheet-gateway.js';

const TEMPORARY_ENDPOINT_NOTE =
  'This endpoint returns only sanitized structural diagnostics and requires an authenticated Admin session (see the Admin authorization middleware).';

const REDACTED_COLUMN = '[redacted]';
/** Defense in depth for columns the registry doesn't know about yet (see UNKNOWN_COLUMN). */
const SENSITIVE_NAME_PATTERN = /password|plaintext|private_key|secret|token|api_key|credential/i;

/**
 * Diagnostics must never name a column flagged `sensitive` in the registry
 * (e.g. 02_USERS.gate_code_plaintext, 03_SECRETS_DEV.plaintext_value) even
 * though the column's *value* is never included either way — the column
 * name itself is treated as sensitive metadata under an endpoint that has
 * no authentication until M02.
 */
function genericIssueMessage(code: string, column: string): string {
  switch (code) {
    case 'INVALID_BOOLEAN':
      return `Column "${column}" is not a recognized boolean value.`;
    case 'INVALID_INTEGER':
      return `Column "${column}" is not a valid integer.`;
    case 'INVALID_NUMBER':
      return `Column "${column}" is not a valid number.`;
    case 'INVALID_JSON':
      return `Column "${column}" is not valid JSON.`;
    case 'INVALID_DATE':
      return `Column "${column}" is not a recognized date/datetime value.`;
    case 'INVALID_CONTROLLED_VALUE':
      return `Column "${column}" value is not in its controlled list.`;
    case 'PLACEHOLDER_VALUE':
      return `Column "${column}" still contains an un-replaced placeholder value.`;
    case 'BLANK_REQUIRED_ID':
      return 'Primary key is blank for this row.';
    case 'DUPLICATE_PRIMARY_KEY':
      return 'Primary key value is used by more than one row.';
    default:
      return `Column "${column}" has an issue.`;
  }
}

function sanitizeColumnDiagnostic(
  tabName: TabName,
  columnName: string,
  buildMessage: (column: string) => string,
): { column: string; message: string } {
  const def = TAB_REGISTRY[tabName];
  const columnDef = isTableTab(def) ? def.columns.find((c) => c.name === columnName) : undefined;
  const isSensitive =
    columnDef?.sensitive === true || (!columnDef && SENSITIVE_NAME_PATTERN.test(columnName));

  if (isSensitive) {
    return { column: REDACTED_COLUMN, message: buildMessage(REDACTED_COLUMN) };
  }
  return { column: columnName, message: buildMessage(columnName) };
}

export async function computeSchemaHealth(
  gateway: SheetGateway,
  options?: ReadOptions,
): Promise<SchemaHealthResponse> {
  const metadata = await gateway.getMetadata(options);
  const foundTabs = metadata.tabTitles;

  const diagnostics: SchemaHealthDiagnostic[] = [];
  const tabSummaries: SchemaHealthTabSummary[] = [];

  const missingTabs = TAB_NAMES.filter((name) => !foundTabs.includes(name));
  for (const tab of missingTabs) {
    diagnostics.push({
      tab,
      code: 'TAB_MISSING',
      severity: 'ERROR',
      message: `Expected tab "${tab}" was not found in the spreadsheet.`,
    });
  }

  const unexpectedTabs = foundTabs.filter((t) => !(TAB_NAMES as readonly string[]).includes(t));
  for (const tab of unexpectedTabs) {
    diagnostics.push({
      tab,
      code: 'UNEXPECTED_TAB',
      severity: 'INFO',
      message: `Tab "${tab}" is present in the spreadsheet but not declared in the tab registry.`,
    });
  }

  if (foundTabs.length !== EXPECTED_TAB_COUNT) {
    diagnostics.push({
      tab: '(workbook)',
      code: 'TAB_COUNT_MISMATCH',
      severity: 'WARNING',
      message: `Expected ${EXPECTED_TAB_COUNT} tabs, found ${foundTabs.length}.`,
    });
  }

  const readmeFound = foundTabs.includes('00_README');
  tabSummaries.push({
    tab: '00_README',
    found: readmeFound,
    status: readmeFound ? 'healthy' : 'error',
    requiredColumnCount: 0,
    actualColumnCount: 0,
    errorCount: readmeFound ? 0 : 1,
    warningCount: 0,
    infoCount: 0,
  });

  const presentTableTabs = TABLE_TAB_NAMES.filter((name) => foundTabs.includes(name));
  const parsedByTab = await gateway.readTabsBatch(presentTableTabs, options);

  for (const tabName of TABLE_TAB_NAMES) {
    const def = TAB_REGISTRY[tabName];
    if (!isTableTab(def)) continue;

    if (!foundTabs.includes(tabName)) {
      tabSummaries.push({
        tab: tabName,
        found: false,
        status: 'error',
        requiredColumnCount: def.columns.length,
        actualColumnCount: 0,
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
      });
      continue;
    }

    const parsed = parsedByTab[tabName]!;
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (const missingColumn of parsed.missingColumns) {
      const { column, message } = sanitizeColumnDiagnostic(
        tabName,
        missingColumn,
        (col) => `Required column "${col}" is missing.`,
      );
      diagnostics.push({
        tab: tabName,
        code: 'MISSING_REQUIRED_COLUMN',
        severity: 'ERROR',
        column,
        message,
      });
      errorCount++;
    }

    for (const unknownColumn of parsed.unknownColumns) {
      const { column, message } = sanitizeColumnDiagnostic(
        tabName,
        unknownColumn,
        (col) => `Column "${col}" is present but not declared in the tab registry.`,
      );
      diagnostics.push({
        tab: tabName,
        code: 'UNKNOWN_COLUMN',
        severity: 'INFO',
        column,
        message,
      });
      infoCount++;
    }

    for (const issue of parsed.issues) {
      const severity = issue.code === 'PLACEHOLDER_VALUE' ? 'WARNING' : 'ERROR';
      const { column, message } = sanitizeColumnDiagnostic(tabName, issue.column, (col) =>
        col === REDACTED_COLUMN ? genericIssueMessage(issue.code, col) : issue.message,
      );
      diagnostics.push({
        tab: tabName,
        code: issue.code,
        severity,
        rowIndex: issue.rowIndex,
        rowId: issue.rowId ?? undefined,
        column,
        message,
      });
      if (severity === 'ERROR') errorCount++;
      else warningCount++;
    }

    const actualColumnCount =
      def.columns.length - parsed.missingColumns.length + parsed.unknownColumns.length;
    const status: SchemaHealthStatus =
      errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'healthy';

    tabSummaries.push({
      tab: tabName,
      found: true,
      status,
      requiredColumnCount: def.columns.length,
      actualColumnCount,
      errorCount,
      warningCount,
      infoCount,
    });
  }

  for (const relationship of RELATIONSHIPS) {
    const fromParsed = parsedByTab[relationship.fromTab];
    const toParsed = parsedByTab[relationship.toTab];
    if (!fromParsed || !toParsed) continue;

    const targetValues = new Set<string>();
    for (const targetRow of toParsed.rows) {
      const value = targetRow.values[relationship.toColumn];
      if (typeof value === 'string' && value) targetValues.add(value);
    }

    for (const sourceRow of fromParsed.rows) {
      const rawValue = sourceRow.values[relationship.fromColumn];
      const candidates: string[] = relationship.isCsv
        ? Array.isArray(rawValue)
          ? (rawValue as string[])
          : []
        : typeof rawValue === 'string'
          ? [rawValue]
          : [];

      for (const candidate of candidates) {
        if (!candidate) {
          if (relationship.allowBlank) continue;
        }
        if (candidate && !targetValues.has(candidate)) {
          diagnostics.push({
            tab: relationship.fromTab,
            code: 'INVALID_REFERENCE',
            severity: 'ERROR',
            rowIndex: sourceRow.rowIndex,
            rowId: sourceRow.primaryKeyValue ?? undefined,
            column: relationship.fromColumn,
            message: `Value does not match any "${relationship.toColumn}" in ${relationship.toTab}.`,
          });
          const summary = tabSummaries.find((s) => s.tab === relationship.fromTab);
          if (summary) {
            summary.errorCount += 1;
            summary.status = 'error';
          }
        }
      }
    }
  }

  const dictionaryParsed = parsedByTab['38_DATA_DICTIONARY'];
  if (dictionaryParsed) {
    for (const dictRow of dictionaryParsed.rows) {
      const tab = dictRow.raw.sheet_name as TabName | undefined;
      const declaredPrimaryKey = dictRow.raw.primary_key;
      const def = tab ? TAB_REGISTRY[tab] : undefined;
      if (def && isTableTab(def) && declaredPrimaryKey) {
        const registryPrimaryKey = def.primaryKey ?? 'list_value_key';
        if (declaredPrimaryKey !== registryPrimaryKey) {
          diagnostics.push({
            tab: tab!,
            code: 'DATA_DICTIONARY_MISMATCH',
            severity: 'INFO',
            message:
              '38_DATA_DICTIONARY declares a different primary key than the tab registry for this tab.',
          });
        }
      }
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'ERROR').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'WARNING').length;
  const infoCount = diagnostics.filter((d) => d.severity === 'INFO').length;
  const healthyTabCount = tabSummaries.filter((t) => t.status === 'healthy').length;
  const status: SchemaHealthStatus =
    errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'healthy';

  return {
    ok: true,
    summary: {
      status,
      expectedTabCount: EXPECTED_TAB_COUNT,
      foundTabCount: foundTabs.length,
      healthyTabCount,
      errorCount,
      warningCount,
      infoCount,
      checkedAt: new Date().toISOString(),
    },
    tabs: tabSummaries,
    diagnostics,
    note: TEMPORARY_ENDPOINT_NOTE,
  };
}
