import { useEffect, useState } from 'react';
import type { ContentRuntimeResponse } from '@veoullas-world/contracts';
import { fetchContentRuntime } from '../../services/contentRuntimeClient';
import { useLocaleStore } from '../../i18n/localeStore';
import { BEACH_TO_CHURCH_JOURNEY } from '../scene-engine/sceneDefinitions';
import { SceneStage } from '../scene-engine/SceneStage';
import { ContinueButton } from '../narrative/ContinueButton';
import styles from './BeachArrival.module.css';
export interface BeachArrivalProps {
  onContinue: () => void;
}
export function BeachArrival({ onContinue }: BeachArrivalProps) {
  const beach = BEACH_TO_CHURCH_JOURNEY.nodes[0]!;
  const locale = useLocaleStore((s) => s.locale);
  const [content, setContent] = useState<ContentRuntimeResponse | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchContentRuntime().then((result) => {
      if (!cancelled && result.status === 'online') setContent(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section className={styles.arrival} data-testid="beach-arrival">
      <SceneStage
        node={beach}
        pan={0}
        backgroundAsset={content?.assets.find((a) => a.assetId === beach.backgroundAssetId)}
        companionAsset={content?.assets.find((a) => a.assetId === 'var_idle_no_collar')}
        icons={content?.icons}
      />
      <ContinueButton
        className={styles.continueButton}
        uiText={content?.uiText ?? []}
        locale={locale}
        disabled={pending}
        testId="beach-arrival-continue"
        onClick={() => {
          setPending(true);
          onContinue();
        }}
      />
    </section>
  );
}
