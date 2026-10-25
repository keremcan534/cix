import { Redirect } from 'expo-router';

import { KABILE_ROUTES } from '@/data/kabile';

export default function KabileIndex() {
  return <Redirect href={KABILE_ROUTES.profile} />;
}
