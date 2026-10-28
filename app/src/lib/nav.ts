// Back that always lands somewhere. A screen opened by link, notification or a web reload has nothing
// beneath it in the stack, and a bare router.back() there throws "GO_BACK was not handled".
import { router, type Href } from 'expo-router';

export const goBack = (fallback: Href = '/') => (router.canGoBack() ? router.back() : router.replace(fallback));
