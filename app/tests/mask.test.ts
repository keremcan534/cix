/// <reference types="node" />
// Maske in video calls (lib/mask, modules/similar-beauty): the masks in their order with their names, the one I chose
// kept on this phone, off when it isn't mine, the effects my camera gets (the mask right after the beauty filter, and
// only in an APK that has it), and the WebRTC library's effect chain the native mask (MaskEffect) is written for. The
// phone's storage and the native module are stand-ins (tests/api-stub-hooks.mjs, tests/native-stub-hooks.mjs).
import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

register('./api-stub-hooks.mjs', import.meta.url);
register('./native-stub-hooks.mjs', import.meta.url);

type Mask = typeof import('../src/lib/mask.ts');
const KEY = 'similarclub:mask:v1';
const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());

// The SimilarBeauty module of an APK with the mask; a test takes parts of it away to be an older APK.
const sent: string[] = [];
const native: Record<string, unknown> = {
  register: () => true,
  setStrength: () => {},
  registerMask: () => true,
  setMask: (kind: string) => void sent.push(kind),
};
(globalThis as { __nativeModules?: Record<string, unknown> }).__nativeModules = { SimilarBeauty: native };

const fx = await import('../modules/similar-beauty');
let starts = 0;
/** A new copy of lib/mask (its choice lives in the module), as on a new app start, once it read the saved mask. */
const startApp = async (): Promise<Mask> => {
  const m: Mask = await import(`../src/lib/mask.ts?start=${++starts}`);
  await new Promise((r) => setTimeout(r, 0));
  return m;
};

test('maskeler sırayla: Kapalı → Göz maskesi → Mozaik yüz → Emoji yüz → Kapalı; ilk açılışta kapalı, seçim telefonda kalır', async () => {
  store.clear();
  const m = await startApp();
  assert.deepEqual(
    m.MASKS.map((x) => [x.kind, x.name]),
    [
      ['off', 'Kapalı'],
      ['eyes', 'Göz maskesi'],
      ['mosaic', 'Mozaik yüz'],
      ['emoji', 'Emoji yüz'],
    ],
  );
  assert.equal(m.nextMaskKind(), 'eyes', 'kapalıdan başlar');
  assert.equal(store.get(KEY), 'eyes');
  assert.equal(m.nextMaskKind(), 'mosaic');
  assert.equal(m.nextMaskKind(), 'emoji');
  assert.equal(m.nextMaskKind(), 'off');
  assert.equal(store.get(KEY), 'off');
  assert.equal(m.maskName('emoji'), 'Emoji yüz');
});

test('sonraki açılışta kayıtlı maske gelir; tanınmayan kayıt kapalı sayılır', async () => {
  store.clear();
  store.set(KEY, 'emoji');
  assert.equal((await startApp()).nextMaskKind(), 'off', 'emoji kayıtlıydı');
  store.set(KEY, 'peçe');
  assert.equal((await startApp()).nextMaskKind(), 'eyes', 'bilinmeyen kayıt: kapalıdan');
});

test('maske yalnız benimse kameraya gider, değilse kapalı', async () => {
  const m = await startApp();
  sent.length = 0;
  m.applyMask(true, 'emoji');
  m.applyMask(false, 'emoji');
  m.applyMask(true, 'eyes');
  m.applyMask(true, 'off');
  assert.deepEqual(sent, ['emoji', 'off', 'eyes', 'off']);
});

test('kameranın efektleri: güzellik filtresi, hemen ardından maske; maskesi olmayan eski APK’da yalnız filtre, eskisi gibi', () => {
  assert.equal(fx.registerMask(), true);
  assert.deepEqual(fx.videoEffects(), [fx.BEAUTY_EFFECT, fx.MASK_EFFECT]);
  assert.deepEqual([fx.BEAUTY_EFFECT, fx.MASK_EFFECT], ['similar-beauty', 'similar-mask']);
  const { registerMask, setMask } = native;
  delete native.registerMask;
  delete native.setMask;
  try {
    assert.equal(fx.registerMask(), false);
    assert.deepEqual(fx.videoEffects(), ['similar-beauty']);
    assert.doesNotThrow(() => fx.setMask('eyes'));
  } finally {
    Object.assign(native, { registerMask, setMask });
  }
});

test('filtre WebRTC’ye tanıtılamazsa maske de yok (maske filtrenin ardından çalışır); bir hata kamerayı durdurmaz', () => {
  const { register: registerBeauty, registerMask } = native;
  native.register = () => false;
  try {
    assert.equal(fx.registerMask(), false);
    assert.equal(fx.videoEffects(), null);
  } finally {
    native.register = registerBeauty;
  }
  native.registerMask = () => {
    throw new Error('WebRTC sınıfı yok');
  };
  try {
    assert.equal(fx.registerMask(), false);
    assert.deepEqual(fx.videoEffects(), ['similar-beauty']);
  } finally {
    native.registerMask = registerMask;
  }
});

test('WebRTC’nin efekt zinciri sonraki efekte öncekinin karesini bırakmadan verir: MaskEffect o kareyi kendisi bırakır', () => {
  // VideoEffectProcessor (@livekit/react-native-webrtc) never releases the frame one effect hands to the next, so the
  // mask (second) owns it (MaskEffect's class comment). If the library changes this, MaskEffect.process must change too:
  // the frame would be released twice (a crash) or never (the camera freezes).
  const file = path.join(
    import.meta.dirname,
    '../node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/videoEffects/VideoEffectProcessor.java',
  );
  const source = fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ');
  const chain = [
    'public void onFrameCaptured(VideoFrame frame) {',
    'frame.retain();',
    'VideoFrame outputFrame = frame;',
    'for (VideoFrameProcessor processor : this.videoFrameProcessors) {',
    'outputFrame = processor.process(outputFrame, textureHelper);',
    'if (outputFrame == null) {',
    'mSink.onFrame(frame);',
    'frame.release();',
    'return;',
    '}',
    '}',
    'mSink.onFrame(outputFrame);',
    'outputFrame.release();',
    'frame.release();',
    '}',
  ].join(' ');
  assert.ok(source.includes(chain), 'WebRTC kütüphanesinin efekt zinciri değişti: MaskEffect’in kare sahipliğini yeniden kontrol edin');
});
