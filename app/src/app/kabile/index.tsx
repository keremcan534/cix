import { Redirect } from 'expo-router';

import { ComingSoon } from '@/components/coming-soon';
import { KABILE_ROUTES } from '@/data/kabile';
import { liveMode } from '@/lib/live';

// Tayfa has no server yet (data/kabile tayfaAvailable): a live build shows the notice here as well.
export default function KabileIndex() {
  if (liveMode()) return <ComingSoon title="Tayfa" />;
  return <Redirect href={KABILE_ROUTES.profile} />;
}
