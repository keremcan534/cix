// Crash and error reports to Sentry (docs/SUNUCU.md, "Hata izleme ve acil durum"). Off unless the build has
// EXPO_PUBLIC_SENTRY_DSN; then the native layer (the config plugin in app.json) also reports native crashes.
//
// Reported: what lib/crash-guard keeps from closing the app, what the error screens (components/crash-screen)
// catch, and crashes before the first screen (Sentry's own handler). Each report carries the app version, the
// over-the-air update it runs (expo-updates), the environment (EXPO_PUBLIC_APP_ENV: preview / production) and
// the signed-in server user id. Never: phone numbers, message text, query strings (lib/report-scrub).
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { setCrashReporter } from '@/lib/crash-guard';
import { myServerId } from '@/lib/live';
import { scrubBreadcrumb, scrubText, scrubUrl } from '@/lib/report-scrub';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const DEV = typeof __DEV__ !== 'undefined' && __DEV__;
/** The app version people see (app.json "version"); the minimum-version check uses the same one. */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || (DEV ? 'development' : 'preview');

let on = false;
export const reportingOn = () => on;

/** Starts reporting once, before anything else runs (app/_layout). Does nothing without a DSN. */
export function initReporting() {
  if (on || !DSN) return;
  try {
    Sentry.init({
      dsn: DSN,
      release: `similar-club@${APP_VERSION}`,
      dist: String(Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '1'),
      environment: APP_ENV,
      // Development keeps React Native's red screen and sends nothing.
      enabled: !DEV,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      tracesSampleRate: 0,
      beforeBreadcrumb: (b) => scrubBreadcrumb(b),
      beforeSend(event) {
        const id = myServerId();
        event.user = id ? { id } : undefined;
        delete event.request;
        for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value);
        if (event.message) event.message = scrubText(event.message);
        if (typeof event.transaction === 'string') event.transaction = scrubUrl(event.transaction);
        return event;
      },
    });
    Sentry.setTag('update_id', Updates.updateId ?? 'embedded');
    if (Updates.channel) Sentry.setTag('channel', Updates.channel);
    on = true;
    setCrashReporter((error) => reportError(error, { source: 'crash-guard' }));
  } catch (e) {
    // Reporting must never be the reason the app doesn't start.
    console.warn('Hata raporlama başlatılamadı', e);
  }
}

/** Sends an error with a few tags (where it was caught). No-op when reporting is off. */
export function reportError(error: unknown, tags: Record<string, string> = {}) {
  if (!on) return;
  try {
    Sentry.captureException(error instanceof Error ? error : new Error(scrubText(String(error))), { tags });
  } catch {
    // Never let a report throw.
  }
}
