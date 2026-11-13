// Web preview in demo mode, so the screens can be looked at without an account: no server, the sample rooms and
// people, and "Demo hesabıyla hızlı giriş" on the sign-in screen. The .env files (the real server's addresses) are
// not read here, so this never talks to the server. Usage: node scripts/web-demo.mjs [port]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = process.argv[2] ?? '8097';
const env = { ...process.env, EXPO_NO_DOTENV: '1', EXPO_PUBLIC_API_URL: '', EXPO_PUBLIC_LIVEKIT_URL: '' };
const child = spawn('npx', ['expo', 'start', '--web', '--port', port], { stdio: 'inherit', shell: true, env, cwd: fileURLToPath(new URL('..', import.meta.url)) });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
