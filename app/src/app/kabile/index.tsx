import { Redirect } from 'expo-router';

import { ComingSoon } from '@/components/coming-soon';
import { KABILE_ROUTES } from '@/data/kabile';
import { liveMode } from '@/lib/live';

// Aile has no server yet (data/kabile tayfaAvailable): a live build shows the notice here as well.
export default function KabileIndex() {
  if (liveMode()) return <ComingSoon title="Aile" />;
  return <Redirect href={KABILE_ROUTES.profile} />;
}
