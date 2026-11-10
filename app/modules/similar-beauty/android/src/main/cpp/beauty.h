#ifndef SIMILAR_BEAUTY_H
#define SIMILAR_BEAUTY_H
#include <stdint.h>
/** Beautifies an 8-bit luma plane in place (strength 1..100). 0 when done, -1 when refused (nothing changed). */
int sb_beautify(uint8_t *y, int width, int height, int stride, int strength);
#endif
