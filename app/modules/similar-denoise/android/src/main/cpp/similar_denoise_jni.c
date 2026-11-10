// "Mikrofon denoise" with RNNoise (rnnoise/, BSD-3-Clause, Xiph.Org / Mozilla): the mic's 10 ms frames at 48 kHz
// cleaned in place. Called from expo.modules.similardenoise.Rnnoise (Java) on WebRTC's audio thread.
#include <jni.h>
#include <math.h>
#include <stdint.h>
#include "rnnoise.h"

#define FRAME 480

JNIEXPORT jlong JNICALL Java_expo_modules_similardenoise_Rnnoise_create(JNIEnv *env, jclass cls) {
  (void)env;
  (void)cls;
  return (jlong)(intptr_t)rnnoise_create(NULL);
}

JNIEXPORT void JNICALL Java_expo_modules_similardenoise_Rnnoise_destroy(JNIEnv *env, jclass cls, jlong st) {
  (void)env;
  (void)cls;
  if (st) rnnoise_destroy((DenoiseState *)(intptr_t)st);
}

// The first 480 floats of a direct buffer (WebRTC's FloatS16: -32768..32767), denoised in place. Returns the voice
// probability RNNoise saw (0..1), or -1 when the buffer can't be used (it is then left as it was).
JNIEXPORT jfloat JNICALL Java_expo_modules_similardenoise_Rnnoise_process(JNIEnv *env, jclass cls, jlong st, jobject buf) {
  (void)cls;
  if (!st || !buf) return -1.f;
  float *p = (float *)(*env)->GetDirectBufferAddress(env, buf);
  jlong cap = (*env)->GetDirectBufferCapacity(env, buf);
  if (!p || cap < (jlong)(FRAME * sizeof(float))) return -1.f;
  float out[FRAME];
  float vad = rnnoise_process_frame((DenoiseState *)(intptr_t)st, out, p);
  // Whatever goes back must be a sample WebRTC can take.
  for (int i = 0; i < FRAME; i++) {
    float v = out[i];
    p[i] = isfinite(v) ? (v > 32767.f ? 32767.f : v < -32768.f ? -32768.f : v) : 0.f;
  }
  return vad;
}
