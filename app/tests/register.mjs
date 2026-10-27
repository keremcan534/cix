// Lets `node --test` load the app's TypeScript modules directly: Node strips the types, and this hook
// maps the `@/…` path alias (tsconfig) to `src/…`. Only pure logic modules (no JSX) are imported in tests.
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
