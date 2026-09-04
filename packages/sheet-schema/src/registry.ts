import { TAB_NAMES, type TabName } from './tab-names.js';
import type { TabDefinition, TableTabDefinition } from './types.js';
import { isTableTab } from './types.js';
import { SYSTEM_CONFIG_TABS } from './tabs/system-config.js';
import { LOCALIZATION_MEDIA_TABS } from './tabs/localization-media.js';
import { WORLD_STRUCTURE_TABS } from './tabs/world-structure.js';
import { EVENT_TABS } from './tabs/events.js';
import { CONTENT_SYSTEM_TABS } from './tabs/content-systems.js';
import { PLAYER_STATE_TABS } from './tabs/player-state.js';
import { META_TABS } from './tabs/meta.js';
import { VAR_TABS } from './tabs/var.js';

const README_DEFINITION: TabDefinition = {
  name: '00_README',
  kind: 'readme',
  purpose: 'Workbook map, operating rules, health checks, and quick links.',
  sensitivity: 'Internal',
  readBy: 'Admin / Claude',
  writeBy: 'Generated',
  adminEditable: false,
  notes: 'Start here.',
};

const ALL_DEFINITIONS: TabDefinition[] = [
  README_DEFINITION,
  ...SYSTEM_CONFIG_TABS,
  ...LOCALIZATION_MEDIA_TABS,
  ...WORLD_STRUCTURE_TABS,
  ...EVENT_TABS,
  ...CONTENT_SYSTEM_TABS,
  ...PLAYER_STATE_TABS,
  ...META_TABS,
  ...VAR_TABS,
];

export const TAB_REGISTRY: Record<TabName, TabDefinition> = Object.fromEntries(
  ALL_DEFINITIONS.map((def) => [def.name, def]),
) as Record<TabName, TabDefinition>;

export function getTabDefinition(name: TabName): TabDefinition {
  const def = TAB_REGISTRY[name];
  if (!def) {
    throw new Error(`No tab definition registered for "${name}"`);
  }
  return def;
}

export function getTableTabDefinition(name: Exclude<TabName, '00_README'>): TableTabDefinition {
  const def = getTabDefinition(name);
  if (!isTableTab(def)) {
    throw new Error(`Tab "${name}" is not a table tab`);
  }
  return def;
}

export const TABLE_TAB_NAMES: Exclude<TabName, '00_README'>[] = TAB_NAMES.filter(
  (name): name is Exclude<TabName, '00_README'> => name !== '00_README',
);

export { TAB_NAMES, EXPECTED_TAB_COUNT } from './tab-names.js';
export type { TabName } from './tab-names.js';
