// Immutable release pins; agent and controller versions are independent.
export const MATCHBOT_VERSION = '0.4.1';
export const MATCHBOT_MIN_WEB_VERSION = '0.5.2';
export const MATCHBOT_SOURCE = 'releases/0.4.1/matchbot_csco_mm.so';
export const MATCHBOT_LANGUAGE = 'releases/0.4.1/language.txt';
export const MATCHBOT_ARCHIVE = 'source-bundles/mixqueue2-cs16-0.4.1.zip';
export const matchbotReleaseHashes = {
  [MATCHBOT_SOURCE]: 'f0062c2ce1915a193830dadcb3a4b3efabf052cd6654bdf3a75cb4ae8bf4b6bb',
  [MATCHBOT_LANGUAGE]: '877007aa9b884af157b69cd8d33c73af00e4d6583f48a588ec5a26b2ce38bf27',
  [MATCHBOT_ARCHIVE]: '43e68619e5682bbadd8df502f0f29474526bea42a451add5bc29016f1a913121',
};
export function matchbotVersionForHash(hash: string): string | null {
  if (hash === matchbotReleaseHashes[MATCHBOT_SOURCE]) return MATCHBOT_VERSION;
  if (hash === '0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e') return '0.4.0';
  return null;
}
