// Immutable release pins; agent and controller versions are independent.
export const MATCHBOT_VERSION = '0.5.0';
export const MATCHBOT_MIN_WEB_VERSION = '0.6.0';
export const MATCHBOT_SOURCE = 'releases/0.5.0/matchbot_csco_mm.so';
export const MATCHBOT_LANGUAGE = 'releases/0.5.0/language.txt';
export const MATCHBOT_ARCHIVE = 'source-bundles/mixqueue2-cs16-0.5.0.zip';
export const matchbotReleaseHashes = {
  [MATCHBOT_SOURCE]: '0b66608bb29296e101f5191b8a73c5b3d2359e0dc4441f17397d9852df36b490',
  [MATCHBOT_LANGUAGE]: '877007aa9b884af157b69cd8d33c73af00e4d6583f48a588ec5a26b2ce38bf27',
  [MATCHBOT_ARCHIVE]: '57638e836ba41c0c3f8ddbed467568e147bc4d97283d8ed5991e56bddc99666f',
};
export function matchbotVersionForHash(hash: string): string | null {
  if (hash === matchbotReleaseHashes[MATCHBOT_SOURCE]) return MATCHBOT_VERSION;
  if (hash === '0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e') return '0.4.0';
  if (hash === 'f0062c2ce1915a193830dadcb3a4b3efabf052cd6654bdf3a75cb4ae8bf4b6bb') return '0.4.1';
  return null;
}
