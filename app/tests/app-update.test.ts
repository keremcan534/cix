/// <reference types="node" />
// Ayarlar › Uygulama sürümü: a newer "preview-N" release than this build is an update (lib/app-update).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { updateFrom, versionLabel } from '@/lib/app-update';

const rel = (tag: string, assets: unknown[] = [{ name: 'similar-club.apk', browser_download_url: 'https://github.com/x/y/releases/download/p/similar-club.apk' }]) => ({ tag_name: tag, html_url: 'https://github.com/x/y/releases/tag/p', assets });

describe('app-update', () => {
  test('a newer build is an update with the APK link', () => {
    assert.deepEqual(updateFrom(rel('preview-95'), 93), { build: 95, url: 'https://github.com/x/y/releases/download/p/similar-club.apk' });
  });
  test('the same or an older build is not', () => {
    assert.equal(updateFrom(rel('preview-93'), 93), null);
    assert.equal(updateFrom(rel('preview-90'), 93), null);
  });
  test('without a build number (store build) nothing is offered', () => {
    assert.equal(updateFrom(rel('preview-95'), 0), null);
  });
  test('odd answers are ignored; no APK falls back to the release page', () => {
    assert.equal(updateFrom(null, 93), null);
    assert.equal(updateFrom({ tag_name: 'v2' }, 93), null);
    assert.equal(updateFrom(rel('preview-95', []), 93)?.url, 'https://github.com/x/y/releases/tag/p');
    assert.equal(updateFrom({ tag_name: 'preview-95', html_url: 'javascript:alert(1)' }, 93), null);
  });
  test('label', () => {
    assert.equal(versionLabel('1.0.0', 93), '1.0.0 · yapı 93');
    assert.equal(versionLabel('1.0.0', 0), '1.0.0');
  });
});
