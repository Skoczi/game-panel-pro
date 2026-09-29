// Immutable release pins; agent and controller versions are independent.
export const MATCHBOT_VERSION = '0.5.2';
export const MATCHBOT_MIN_WEB_VERSION = '0.6.5';
export const MATCHBOT_SOURCE = 'releases/0.5.2/matchbot_csco_mm.so';
export const MATCHBOT_LANGUAGE = 'releases/0.5.2/language.txt';
export const MATCHBOT_ARCHIVE = 'source-bundles/mixqueue2-cs16-0.5.2.zip';
export const matchbotReleaseHashes = {
  [MATCHBOT_SOURCE]: 'ae8cf6516f4a684d44bff8e21f0a590b1de1988351557450bc76efdfe6d1e82d',
  [MATCHBOT_LANGUAGE]: '877007aa9b884af157b69cd8d33c73af00e4d6583f48a588ec5a26b2ce38bf27',
  [MATCHBOT_ARCHIVE]: '86381d8451b0661d0d572a5857f87ebf1c563ee979307b8aa1fecdf5560f5f34',
};
export function matchbotVersionForHash(hash: string): string | null {
  if (hash === matchbotReleaseHashes[MATCHBOT_SOURCE]) return MATCHBOT_VERSION;
  if (hash === '0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e') return '0.4.0';
  if (hash === 'f0062c2ce1915a193830dadcb3a4b3efabf052cd6654bdf3a75cb4ae8bf4b6bb') return '0.4.1';
  if (hash === '0b66608bb29296e101f5191b8a73c5b3d2359e0dc4441f17397d9852df36b490') return '0.5.0';
  if (hash === '6cac5c2f16e8236580ebf8738a95678c60946497571de645a0175293eef6dffb') return '0.5.1';
  return null;
}
