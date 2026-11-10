// Güzellik filtresi (görüntülü arama): on the camera's luma plane, in place. Edge-aware smoothing (skin gets
// softer, eyes, brows and hair keep their edges) and a gentle brightening, both by `strength` (1..100).
// Box means by running sums (O(1) a pixel), so a 640x480 frame takes a few milliseconds.
#include "beauty.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static inline int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

int sb_beautify(uint8_t *y, int width, int height, int stride, int strength) {
  if (!y || width < 8 || height < 8 || stride < width || strength <= 0) return -1;
  if (strength > 100) strength = 100;
  const int r = clampi(width / 200, 2, 6);
  const int win = 2 * r + 1;
  const int inv = ((1 << 16) + win / 2) / win;  // x / win as (x * inv + half) >> 16, rounded
  uint8_t *tmp = (uint8_t *)malloc((size_t)width * (size_t)height);
  int *col = (int *)malloc(sizeof(int) * (size_t)width);
  if (!tmp || !col) {
    free(tmp);
    free(col);
    return -1;
  }
  // Horizontal means of the original into tmp.
  for (int row = 0; row < height; row++) {
    const uint8_t *src = y + (size_t)row * stride;
    uint8_t *dst = tmp + (size_t)row * width;
    int sum = 0;
    for (int k = -r; k <= r; k++) sum += src[clampi(k, 0, width - 1)];
    for (int x = 0; x < width; x++) {
      dst[x] = (uint8_t)clampi((sum * inv + (1 << 15)) >> 16, 0, 255);
      sum += src[clampi(x + r + 1, 0, width - 1)] - src[clampi(x - r, 0, width - 1)];
    }
  }
  // Brightening curve: a gamma below 1 lifts the mid tones, leaves black and white where they are.
  uint8_t lut[256];
  const double gamma = 1.0 - 0.20 * strength / 100.0;
  for (int i = 0; i < 256; i++) lut[i] = (uint8_t)clampi((int)lround(255.0 * pow(i / 255.0, gamma)), 0, 255);
  // Smoothing reaches only small differences (skin texture); an edge (a bigger difference) keeps its pixel.
  const int edge = 18 + strength / 4;  // 18..43 levels
  const int amount = strength * 256 / 100;  // 0..256
  for (int x = 0; x < width; x++) {
    int sum = 0;
    for (int k = -r; k <= r; k++) sum += tmp[(size_t)clampi(k, 0, height - 1) * width + x];
    col[x] = sum;
  }
  for (int row = 0; row < height; row++) {
    uint8_t *line = y + (size_t)row * stride;
    for (int x = 0; x < width; x++) {
      const int m = clampi((col[x] * inv + (1 << 15)) >> 16, 0, 255);
      const int v = line[x];
      const int d = m - v;
      const int ad = d < 0 ? -d : d;
      int out = v;
      if (ad < edge) out = v + (d * amount * (edge - ad)) / (256 * edge);
      line[x] = lut[clampi(out, 0, 255)];
    }
    const int add = clampi(row + r + 1, 0, height - 1);
    const int sub = clampi(row - r, 0, height - 1);
    const uint8_t *a = tmp + (size_t)add * width;
    const uint8_t *s = tmp + (size_t)sub * width;
    for (int x = 0; x < width; x++) col[x] += a[x] - s[x];
  }
  free(tmp);
  free(col);
  return 0;
}
