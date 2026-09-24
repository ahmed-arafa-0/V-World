import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CottageStateResponse, MailboxDeliveryResponse } from '@veoullas-world/contracts';
import { useWorld, type PlaceId } from '../WorldContext';
import { worldApi } from '../worldClient';
import {
  ActionButton,
  CaptionedHotspot,
  Companion,
  Panel,
  PlaceTitle,
  MarcelinoSprite,
  Stage,
  TextBlock,
  type StageTheme,
} from '../ui';
import { MailboxPanel } from './CottageView';

interface ExteriorProps {
  locationId: Exclude<PlaceId, 'beach' | 'church' | 'farm' | 'map'>;
  theme: StageTheme;
  onEnter: () => void;
  onForward?: () => void;
  onBack?: () => void;
  extra?: ReactNode;
}

/** A road-side approach scene: enter the building, or walk on/back along the road. */
export function LocationExterior({
  locationId,
  theme,
  onEnter,
  onForward,
  onBack,
  extra,
}: ExteriorProps) {
  const env = useWorld();
  return (
    <Stage theme={theme} assetId={`${locationId}_exterior_scene`} testId={`${locationId}-exterior`}>
      <PlaceTitle text={env.t(`place_${locationId}` as never)} />
      <Companion />
      <CaptionedHotspot
        testId={`${locationId}-enter`}
        x={50}
        y={52}
        label={env.t('enter')}
        onClick={onEnter}
      />
      {onBack && (
        <CaptionedHotspot
          testId={`${locationId}-back`}
          x={8}
          y={90}
          slot="walk_back"
          label={env.t('back')}
          onClick={onBack}
        />
      )}
      {onForward && (
        <CaptionedHotspot
          testId={`${locationId}-forward`}
          x={92}
          y={90}
          slot="walk_forward"
          label={env.t('walk_on')}
          onClick={onForward}
        />
      )}
      {extra}
    </Stage>
  );
}

/**
 * The Cottage exterior: the mailbox stands outside, and Marcelino first
 * appears from the garden with his mailbag on the first visit. The delivery
 * text is Ahmed's, from the Sheet — when it is not written yet nothing is
 * invented; delivery stays retryable until that content is available.
 */
export function CottageExterior(
  props: Omit<ExteriorProps, 'locationId' | 'theme' | 'extra' | 'onEnter'> & {
    onEnter: () => void;
  },
) {
  const env = useWorld();
  const [mail, setMail] = useState<CottageStateResponse | null>(null);
  const [showMail, setShowMail] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [delivering, setDelivering] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'arrived' | 'delivered'>('idle');
  const [deliveryDismissed, setDeliveryDismissed] = useState(false);
  const dismissed = useRef(false);
  const closeDelivery = () => {
    dismissed.current = true;
    setDeliveryDismissed(true);
  };
  const reopenDelivery = () => {
    dismissed.current = false;
    setDeliveryDismissed(false);
  };
  const beat = env.journey.currentBeat;
  const introducing =
    beat?.requiredInteractionId === 'first_message_delivery' && env.journey.phase !== 'free';

  const loadMail = async () => {
    const r = await worldApi.get<CottageStateResponse>('/cottage');
    if (r.status === 'online') {
      setMail(r.data);
      return r.data;
    }
    return null;
  };
  useEffect(() => {
    void loadMail();
  }, []);

  async function deliver() {
    setDelivering(true);
    setDeliveryError('');
    const r = await worldApi.post<MailboxDeliveryResponse>('/marcelino/first-delivery');
    setDelivering(false);
    if (r.status !== 'online') {
      setDeliveryError(
        r.code === 'WORLD_CONTENT_UNAVAILABLE'
          ? env.t('first_message_unavailable')
          : r.retryable
            ? env.t('saving_retry')
            : r.message,
      );
      return;
    }
    setMail(r.data.state);
    env.showRewards(r.data.state.rewards);
    await env.refreshJourney();
    setPhase('delivered');
    if (r.data.batches.length > 0 && !dismissed.current) setShowMail(true);
  }

  return (
    <LocationExterior
      {...props}
      locationId="cottage"
      theme="cottage"
      onEnter={props.onEnter}
      extra={
        <>
          <CaptionedHotspot
            testId="cottage-outside-mailbox"
            x={22}
            y={68}
            label={env.t('cottage_mailbox')}
            badge={mail && mail.unreadCount > 0 ? String(mail.unreadCount) : undefined}
            onClick={async () => {
              if (introducing && phase !== 'delivered') {
                reopenDelivery();
                return;
              }
              // A mailbox that never loaded is retried on tap; a failure is said, never silent.
              if (mail || (await loadMail())) setShowMail(true);
              else env.notify(env.t('load_failed'));
            }}
          />
          {introducing && phase !== 'delivered' && <MarcelinoSprite pose="mailbag" />}
          {phase === 'delivered' && <MarcelinoSprite pose="run_away" />}
          {introducing && phase === 'idle' && !deliveryDismissed && (
            <Panel title={env.t('place_cottage')} onClose={closeDelivery} testId="marcelino-intro">
              <TextBlock text={env.t('cottage_marcelino_arrives')} testId="marcelino-arrives" />
              <ActionButton testId="marcelino-deliver" onClick={() => setPhase('arrived')}>
                {env.t('continue')}
              </ActionButton>
            </Panel>
          )}
          {introducing && phase === 'arrived' && !deliveryDismissed && (
            <Panel
              title={env.t('cottage_mailbox')}
              onClose={closeDelivery}
              testId="marcelino-delivering"
            >
              {deliveryError && (
                <p role="alert" data-testid="delivery-error">
                  {deliveryError}
                </p>
              )}
              <ActionButton
                testId="marcelino-hand-over"
                disabled={delivering}
                onClick={() => void deliver()}
              >
                {env.t(delivering ? 'working' : deliveryError ? 'try_again' : 'cottage_open')}
              </ActionButton>
            </Panel>
          )}
          {phase === 'delivered' && !showMail && (
            <p
              role="status"
              data-testid="marcelino-runs"
              style={{
                position: 'absolute',
                bottom: 70,
                width: '100%',
                textAlign: 'center',
                zIndex: 3,
                pointerEvents: 'none',
              }}
            >
              {env.t('cottage_marcelino_runs')}
            </p>
          )}
          {showMail && mail && (
            <MailboxPanel state={mail} onState={setMail} onClose={() => setShowMail(false)} />
          )}
        </>
      }
    />
  );
}
