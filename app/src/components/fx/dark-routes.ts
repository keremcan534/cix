// Which pushed screens are drawn dark in both color schemes (fx/screen-enter). Pure, so the node tests load it.

/**
 * The live room sits on a photo stage and is always dark. The agency screens wait for their own light pass (they
 * are being reworked in another branch). Sıralama is the owners' neon night (23 Nov 2026).
 */
const ALWAYS_DARK = /^(oda|ajans|siralama)(\/|$)/;
/**
 * A call and Hemen Tanış are full-screen calls, so they are dark too, but only while calls exist: without them
 * (lib/live oneOnOneOpen) the same routes show the "Yakında" placeholder, which follows the app's theme like
 * /eslesme does (gorsel-22 g).
 */
const CALL_SCREENS = /^(arama|tanis)(\/|$)/;

export const isDarkRoute = (route: string, callsOn: boolean) => ALWAYS_DARK.test(route) || (callsOn && CALL_SCREENS.test(route));
