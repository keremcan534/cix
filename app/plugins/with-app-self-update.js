// "Güncelleme mevcut" (applied on `expo prebuild`): the side-loaded APK downloads its newer build itself and hands it
// to Android's installer (lib/app-install). Android asks for this permission before an app may open the installer;
// the phone still shows its own "Güncelle" screen, and the first time asks to allow installs from this app.
const { AndroidConfig } = require('expo/config-plugins');

module.exports = function withAppSelfUpdate(config) {
  return AndroidConfig.Permissions.withPermissions(config, ['android.permission.REQUEST_INSTALL_PACKAGES']);
};
