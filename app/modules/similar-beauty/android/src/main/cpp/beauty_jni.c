// JNI for the beauty filter (beauty.c): called from expo.modules.similarbeauty.Beauty on the camera's thread.
#include <jni.h>

#include "beauty.h"

JNIEXPORT jint JNICALL Java_expo_modules_similarbeauty_Beauty_apply(JNIEnv *env, jclass cls, jobject buf, jint width, jint height, jint stride, jint strength) {
  (void)cls;
  if (!buf || width <= 0 || height <= 0 || stride < width) return -1;
  uint8_t *y = (uint8_t *)(*env)->GetDirectBufferAddress(env, buf);
  jlong cap = (*env)->GetDirectBufferCapacity(env, buf);
  if (!y || cap < (jlong)stride * (height - 1) + width) return -1;
  return sb_beautify(y, width, height, stride, strength);
}
