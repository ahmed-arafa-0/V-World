import type { TableTabDefinition } from '../types.js';
import { c } from './column-helper.js';

export const META_TABS: TableTabDefinition[] = [
  {
    name: '38_DATA_DICTIONARY',
    kind: 'table',
    purpose: 'Definition and ownership of every tab.',
    primaryKey: 'sheet_name',
    columns: [
      c('sheet_name', 'id'),
      c('purpose', 'text'),
      c('primary_key', 'text'),
      c('read_by', 'text'),
      c('write_by', 'text'),
      c('admin_editable', 'boolean'),
      c('sensitivity', 'text'),
      c('notes', 'text'),
    ],
    sensitivity: 'Internal',
    readBy: 'Admin / Claude',
    writeBy: 'Admin',
    adminEditable: true,
    notes: 'Keep synchronized when adding tabs.',
  },
  {
    name: '39_VALIDATION_LISTS',
    kind: 'table',
    purpose: 'Central values used for validation and Admin consistency.',
    primaryKey: null,
    derivedPrimaryKey: (row) => `${row.list_name ?? ''}|${row.value ?? ''}`,
    columns: [
      c('list_name', 'text'),
      c('value', 'text'),
      c('sort_order', 'integer'),
      c('enabled', 'boolean'),
      c('notes', 'text'),
    ],
    sensitivity: 'Internal',
    readBy: 'React via backend',
    writeBy: 'Admin or backend',
    adminEditable: true,
    notes:
      'Declared primary key list_value_key is a composite of list_name + value, not a literal column.',
  },
];
