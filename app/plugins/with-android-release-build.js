// Release-build settings the Expo template doesn't cover (applied on `expo prebuild`).
// - R8 keep rules: LiveKit's bundled WebRTC loads livekit.org.jni_zero / livekit.org.webrtc
//   classes from native code, so R8 must not strip or rename them (it failed with
//   "Missing class livekit.org.jni_zero.JniZeroJni"). The AI denoise (modules/similar-denoise)
//   reaches LiveKit's audio processing by reflection and is called from native code: kept too.
// - More Gradle memory: the release build ran out of JVM metaspace on CI.
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# with-android-release-build';
const RULES = `
${MARKER}
-keep class livekit.org.webrtc.** { *; }
-keep class livekit.org.jni_zero.** { *; }
-dontwarn livekit.org.jni_zero.**
-dontwarn livekit.org.webrtc.**
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**
-keep class com.livekit.reactnative.LiveKitReactNative { *; }
-keep class com.livekit.reactnative.audio.processing.** { *; }
-keep class expo.modules.similardenoise.** { *; }
`;

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

module.exports = function withAndroidReleaseBuild(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter(
      (p) => !(p.type === 'property' && p.key === 'org.gradle.jvmargs'),
    );
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes(MARKER)) fs.writeFileSync(file, current + RULES);
      return cfg;
    },
  ]);
};
