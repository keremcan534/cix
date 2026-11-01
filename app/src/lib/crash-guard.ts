// Keeps one bad callback from closing the app. A release build of React Native ends the app on any
// uncaught JS error, even one thrown by a timer or a button handler while everything else is fine.
// Rendering errors are caught by the error screens (components/crash-screen); this catches the rest
// once the first screen is up. Development keeps React Native's red error screen.

type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler: () => Handler; setGlobalHandler: (handler: Handler) => void };

let started = false;
let installed = false;
let last: { message: string; at: number } | null = null;

/** Called once the first screen is showing; from then on stray errors are logged instead of closing the app. */
export const markStarted = () => {
  started = true;
};

/** The last error the guard kept from closing the app (for the support screen and tests). */
export const lastCaughtError = () => last;

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : typeof error === 'string' ? error : 'Bilinmeyen hata');

export function installCrashGuard(dev = typeof __DEV__ !== 'undefined' && __DEV__) {
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  // The web has no ErrorUtils and never closes on an error.
  if (!eu || dev || installed) return;
  installed = true;
  const original = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => {
    // Before the first screen there is nothing to keep running: let React Native report it as usual.
    if (!started) return original(error, isFatal);
    last = { message: errorMessage(error), at: Date.now() };
    console.error('Uygulama hatası yakalandı:', error);
  });
}
