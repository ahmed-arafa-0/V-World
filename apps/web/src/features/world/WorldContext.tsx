import { createContext, useContext } from 'react';
import type {
  JourneyStateResponse,
  RuntimeAssetStatus,
  RuntimeDialogueLine,
  RuntimeIconEntry,
  RuntimeUiTextEntry,
  WorldRewardView,
  WorldTextKey,
} from '@veoullas-world/contracts';
import type { LocaleCode } from '../../i18n/locales';
import type { WalkmanApi } from './useWalkman';

export type PlaceId =
  'beach' | 'church' | 'junction' | 'cafe' | 'arcade' | 'cottage' | 'farm' | 'museum' | 'map';
export type PlaceView = 'exterior' | 'interior';

export interface Place {
  id: PlaceId;
  view: PlaceView;
  /** Beach only: which scene of the beach road to stand in (Back from the crossroads). */
  node?: string;
}

export interface WorldEnv {
  userId: string;
  locale: LocaleCode;
  uiText: RuntimeUiTextEntry[];
  icons: RuntimeIconEntry[];
  assets: RuntimeAssetStatus[];
  dialogue: RuntimeDialogueLine[];
  journey: JourneyStateResponse;
  walkman: WalkmanApi;
  t: (key: WorldTextKey) => string;
  /** Replaces the journey with a fresher server snapshot and surfaces newly earned keys. */
  applyJourney: (next: JourneyStateResponse) => void;
  refreshJourney: () => Promise<JourneyStateResponse | null>;
  showRewards: (rewards: WorldRewardView[] | undefined) => void;
  notify: (message: string) => void;
  go: (place: Place) => void;
  assetRef: (assetId: string | undefined) => string | null;
}

const WorldEnvContext = createContext<WorldEnv | null>(null);

export const WorldEnvProvider = WorldEnvContext.Provider;

export function useWorld(): WorldEnv {
  const env = useContext(WorldEnvContext);
  if (!env) throw new Error('useWorld must be used inside <WorldExperience>.');
  return env;
}
