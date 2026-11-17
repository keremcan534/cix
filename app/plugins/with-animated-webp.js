// Animated WebP in React Native's <Image> (applied on `expo prebuild`): the team's moving frames (Yönetim › Mağaza,
// components/fx/frame-art) are animated WebPs. The Expo template leaves Fresco's animated-webp module out
// (gradle.properties expo.webp.animated=false, because iOS's <Image> can't play them); this app ships on Android, so
// it is turned on. Animated GIFs already play (expo.gif.enabled).
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withAnimatedWebp(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'expo.webp.animated'));
    props.push({ type: 'property', key: 'expo.webp.animated', value: 'true' });
    cfg.modResults = props;
    return cfg;
  });
};
