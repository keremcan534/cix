// The native splash (app.json, expo-splash-screen) as the code sees it. app.json is static JSON and can't import these,
// so they are copies kept in step by hand: tests/intro-timeline.test.ts fails when the two drift. The opening
// (components/fx/intro) starts on exactly this picture, so a change here is a change there too.

/**
 * The splash's background: app.json expo-splash-screen backgroundColor (and its dark variant), expo.backgroundColor and
 * android.adaptiveIcon.backgroundColor. Not the app theme's bg: the logo's own navy.
 */
export const SPLASH_NAVY = '#010E29';
/** The splash mark's width in dp, centred on the whole screen (expo-splash-screen imageWidth). */
export const SPLASH_MARK = 200;
/** How long the native splash fades out (SplashScreen.setOptions in the root layout; Android's default is 400 ms). */
export const SPLASH_FADE = 160;
/**
 * The longest the root layout keeps the splash up for the opening's first frame to draw underneath it (a slow phone
 * decoding its three layers). The splash is the same picture, so the wait doesn't show.
 */
export const SPLASH_WAIT = 300;
