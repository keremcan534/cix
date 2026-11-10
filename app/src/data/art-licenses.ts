// Pictures the app ships that others made, with their licences (Ayarlar › Açık kaynak lisansları). The Duygular
// sticker pack (data/catalog 'duygu', assets/reactions/duygu) is Google's Animated Noto Emoji; CC BY 4.0 asks for
// this credit, a link to the licence, and a note of any changes.
export type ArtLicense = { name: string; source: string; license: string; url: string; text: string };

export const ART_LICENSES: ArtLicense[] = [
  {
    name: 'Animated Noto Emoji',
    source: 'Google',
    license: 'CC BY 4.0',
    url: 'https://googlefonts.github.io/noto-emoji-animation/',
    text: "Animated Noto Emoji\nCopyright Google LLC.\n\nThe animations in this folder (duygu-*.json, Lottie format) are Google's Animated Noto Emoji\n(https://googlefonts.github.io/noto-emoji-animation/), licensed under the Creative Commons\nAttribution 4.0 International License (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/legalcode\n\nThey are used unchanged, except that the JSON was written without spaces (minified). The file names are ours.",
  },
];
