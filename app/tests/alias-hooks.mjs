import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = new URL(specifier.slice(2), SRC).href;
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      if (existsSync(fileURLToPath(base + ext))) return next(base + ext, context);
    }
  }
  return next(specifier, context);
}
