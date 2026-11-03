// Publishes an over-the-air update (JavaScript and images only) to the phones of one build profile:
//   npm run update -- preview "Hediye listesi düzeltildi"
//   npm run update -- production "Giriş hatası düzeltildi"
// docs/SUNUCU.md ("Hata izleme ve acil durum") explains when an update is enough and when a new build is needed.
//
// Why not plain `eas update`: it does not read the build profile's env from eas.json, so the bundle it publishes
// would have no server address (EXPO_PUBLIC_API_URL) and the phones would fall back to the offline prototype.
// This script runs it with exactly the env the build of that profile had.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [profile, ...words] = process.argv.slice(2);
const message = words.join(' ').trim();
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
const build = eas.build?.[profile];

if (!build || !message) {
  console.error('Kullanım: npm run update -- <preview|production> "ne değişti"');
  console.error(`Profiller: ${Object.keys(eas.build ?? {}).join(', ')}`);
  process.exit(2);
}

const env = { ...process.env, ...build.env };
// Without a DSN in the profile, keep the one given on the command line (EXPO_PUBLIC_SENTRY_DSN=... npm run update).
console.log(`→ ${profile} kanalına güncelleme: "${message}"`);
console.log(`  sunucu: ${env.EXPO_PUBLIC_API_URL ?? '(yok: çevrimdışı prototip)'}`);
const r = spawnSync('npx', ['--yes', 'eas-cli@latest', 'update', '--channel', build.channel ?? profile, '--message', message], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
