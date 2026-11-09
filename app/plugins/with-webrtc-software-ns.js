// "Mikrofon denoise" (applied on `expo prebuild`).
// LiveKit turns on the phone's built-in noise suppressor on Android 10+. While a built-in one is on, WebRTC
// leaves its own noise suppressor off, and the room's denoise switch only turns the built-in one on and off,
// which does little or nothing on many phones. This keeps the built-in echo canceller but leaves the built-in
// noise suppressor off, so the switch drives WebRTC's own noise suppressor, which works the same on every phone.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FROM = '.setUseHardwareNoiseSuppressor(useHardwareAudioProcessing)';
const TO = '.setUseHardwareNoiseSuppressor(false) // with-webrtc-software-ns';

module.exports = function withWebrtcSoftwareNs(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = require.resolve('@livekit/react-native/package.json', { paths: [cfg.modRequest.projectRoot] });
      const file = path.join(path.dirname(pkg), 'android/src/main/java/com/livekit/reactnative/LiveKitReactNative.kt');
      const src = fs.readFileSync(file, 'utf8');
      if (src.includes(TO)) return cfg;
      // A LiveKit update moved this line: stop the build rather than ship a denoise switch that does nothing.
      if (!src.includes(FROM)) throw new Error(`with-webrtc-software-ns: "${FROM}" not found in ${file}`);
      fs.writeFileSync(file, src.replace(FROM, TO));
      return cfg;
    },
  ]);
};
