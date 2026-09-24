import { useEffect, useState } from 'react';
import { useLocaleStore } from '../../i18n/localeStore';
import { playerText } from '../../i18n/playerText';
import { LoadingState } from '../../components/LoadingState';
import { fetchPlayerState, postBeachShell, postCheckpoint } from '../../services/playerClient';
import { WorldExperience } from '../world/WorldExperience';
import { BeachArrival } from './BeachArrival';
import { DoorsOpeningTransition } from './DoorsOpeningTransition';
import { NamingPrompt } from './NamingPrompt';

const ROUTE_ID = 'first_opening';

type Phase = 'resolving' | 'unavailable' | 'doors_opening' | 'beach_arrival' | 'naming' | 'beach';

export interface FirstOpeningFlowProps {
  /** True only immediately after a fresh, successful Gate submission THIS render — never true for a resumed session. Controls whether the one-time doors/VAR-jump transition plays. */
  justAuthenticated: boolean;
  userId: string;
}

/**
 * Orchestrates the beats after a successful Gate entry (Living Bible §18J
 * beats 06–09): doors opening → naming → Beach arrival (M07, reusing E's
 * scene engine). Every transition checkpoints through the real M04 API
 * (`routeId: "first_opening"`), so refreshing mid-flow — or a resumed
 * session on a different browser — continues from the correct beat instead
 * of replaying the doors/VAR-jump moment or re-asking for a name that was
 * already chosen.
 */
export function FirstOpeningFlow({ justAuthenticated, userId }: FirstOpeningFlowProps) {
  const locale = useLocaleStore((s) => s.locale);
  const [phase, setPhase] = useState<Phase>('resolving');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase('resolving');
    fetchPlayerState(userId).then((result) => {
      if (cancelled) return;
      // A failed read says nothing about the player: never treat it as a new player (no doors, no
      // Beach arrival, no checkpoint write). Offer an explicit retry instead.
      if (result.status === 'offline' || result.status === 'loading') {
        setPhase('unavailable');
        return;
      }
      if (result.status === 'online' || result.status === 'cached') {
        const progress = result.data.progress.find((p) => p.routeId === ROUTE_ID);
        if (progress?.currentBeatId === 'naming_complete') {
          setPhase('beach');
          return;
        }
        if (progress?.currentBeatId === 'cove_arrival') {
          setPhase('naming');
          return;
        }
        if (progress?.currentBeatId === 'gate_success') {
          setPhase('beach_arrival');
          return;
        }
      }
      // No prior record for this route: only show the one-time doors/VAR-
      // jump transition right after a fresh success this session. A
      // resumed session starts safely at Cove arrival.
      setPhase(justAuthenticated ? 'doors_opening' : 'beach_arrival');
    });
    return () => {
      cancelled = true;
    };
  }, [justAuthenticated, userId, attempt]);

  async function handleDoorsContinue() {
    await postCheckpoint({ routeId: ROUTE_ID, beatId: 'gate_success', checkpoint: true }, userId);
    setPhase('beach_arrival');
  }

  async function handleArrivalContinue() {
    await postCheckpoint(
      { routeId: ROUTE_ID, beatId: 'cove_arrival', checkpoint: true, currentLocation: 'beach' },
      userId,
    );
    setPhase('naming');
  }

  async function handleNamed() {
    await postCheckpoint(
      { routeId: ROUTE_ID, beatId: 'naming_complete', checkpoint: true, currentLocation: 'beach' },
      userId,
    );
    setPhase('beach');
  }

  async function handleMarker(markerId: string, locationId: string): Promise<string | void> {
    if (markerId !== 'shell' || locationId !== 'beach') return markerId;
    const result = await postBeachShell(userId);
    if (result.status !== 'online') return 'Shell reward queued for safe retry.';
    if (result.data.applied) return `Collected ${result.data.keyTypeId}.`;
    return `Shell reward: ${result.data.reason}.`;
  }

  if (phase === 'resolving') {
    return (
      <div data-testid="first-opening-resolving">
        <LoadingState label={playerText('loading', locale)} />
      </div>
    );
  }
  if (phase === 'unavailable') {
    return (
      <div data-testid="first-opening-unavailable" role="alert" style={{ padding: 24 }}>
        <p>{playerText('offline', locale)}</p>
        <button
          type="button"
          data-testid="first-opening-retry"
          onClick={() => setAttempt((n) => n + 1)}
        >
          {playerText('retry', locale)}
        </button>
      </div>
    );
  }
  if (phase === 'doors_opening') {
    return <DoorsOpeningTransition onContinue={() => void handleDoorsContinue()} />;
  }
  if (phase === 'beach_arrival') {
    return <BeachArrival onContinue={() => void handleArrivalContinue()} />;
  }
  if (phase === 'naming') {
    return <NamingPrompt onNamed={() => void handleNamed()} />;
  }
  return <WorldExperience userId={userId} onBeachMarker={handleMarker} />;
}
