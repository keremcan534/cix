// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Text and TextInput come from components/text, which applies the brand typeface by weight.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/text.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput'],
              message: "Text ve TextInput'u '@/components/text' içinden al: marka yazı tipi orada kalınlığa göre uygulanır.",
            },
          ],
        },
      ],
    },
  },
]);
