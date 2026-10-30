// Build flavour. Preview builds (web on GitHub Pages, the side-loaded APK) are demos for the client and keep
// every shortcut: demo sign-in, test coins, data reset, the server/test screens and the admin links in the
// "Ben" menu. A store build sets EXPO_PUBLIC_DEMO=0, which hides those entry points.
//
// This only hides the shortcuts. Admin rights must still be checked on the server before launch.
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO !== '0';
