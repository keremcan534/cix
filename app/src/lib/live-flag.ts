// The live-mode flag without the API client: liveBuild() is true exactly when liveMode() from '@/lib/live' is
// (a server address is set). Small pure modules (PK, games, win feed) use it so they stay loadable in the node
// tests, which cannot import '@/lib/api'. It reads the variable on each call so a test can switch it.
export const liveBuild = (): boolean => !!process.env.EXPO_PUBLIC_API_URL;
