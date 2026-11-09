import { Redirect } from 'expo-router';

import { KABILE_ROUTES } from '@/data/kabile';

// Aile's home is /aile (the server's families in a live build, the sample ones in the demo).
export default function KabileIndex() {
  return <Redirect href={KABILE_ROUTES.profile} />;
}
