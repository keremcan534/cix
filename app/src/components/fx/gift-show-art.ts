// Delivered part pictures for the big gift shows (docs/BUYUK_HEDIYELER.md). Keyed by file name
// (<slug>-<part>.png in assets/gifts/show/). A gift shows its layered stage only when every one of
// its files is here; until then it plays its single 512 px gift picture with the same choreography.
//
// When ChatGPT delivers a file: put it in app/assets/gifts/show/ and add one line, e.g.
//   'kartal-kanat.png': require('../../../assets/gifts/show/kartal-kanat.png'),
export const SHOW_PARTS: Record<string, number> = {};
