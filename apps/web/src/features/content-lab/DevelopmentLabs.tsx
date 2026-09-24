import { useSessionAccess } from '../../hooks/useSessionAccess';
import { ContentRuntimeLab } from './ContentRuntimeLab';
import { NarrativeRuntimeLab } from './NarrativeRuntimeLab';
import { MapCompositionPreview } from '../map-preview/MapCompositionPreview';
export default function DevelopmentLabs() {
  const { status } = useSessionAccess('owner');
  if (status !== 'authenticated') return <a href="/">Return to Gate</a>;
  return (
    <div style={{ padding: 24 }}>
      <ContentRuntimeLab />
      <NarrativeRuntimeLab />
      <MapCompositionPreview />
    </div>
  );
}
