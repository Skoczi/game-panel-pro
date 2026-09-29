// Immutable release pins; agent and controller versions are independent.
export const MATCHBOT_VERSION = '0.6.2';
export const MATCHBOT_MIN_WEB_VERSION = '0.7.2';
export const MATCHBOT_SOURCE = 'releases/0.6.2/matchbot_csco_mm.so';
export const MATCHBOT_LANGUAGE = 'releases/0.6.2/language.txt';
export const MATCHBOT_ARCHIVE = 'source-bundles/mixqueue2-cs16-0.6.2.zip';
export const MATCHBOT_BOT_PROFILES = 'releases/0.6.2/resources/bot_profiles-5.30.0.814.zip';
export const MATCHBOT_NAV_PROOF = 'releases/0.6.2/navigation/nav-proof.json';
export const MATCHBOT_NAV = 'releases/0.6.2/navigation/de_dust2.nav';
export const MATCHBOT_RESOURCE_PROVENANCE = {
  'bot-dependencies.json': 'releases/0.6.2/resources/bot-dependencies.json',
  'upstream-LICENSE': 'releases/0.6.2/resources/upstream-LICENSE',
  'upstream-LICENSE-TRANSITION.md': 'releases/0.6.2/resources/upstream-LICENSE-TRANSITION.md',
};
export const MATCHBOT_NAVIGATION_MANIFEST = 'navigation/0.6.2/manifest.json';
export const MATCHBOT_NAVIGATION_FILES: Record<string, string> = {
  'de_aztec': 'navigation/0.6.2/de_aztec.nav',
  'de_cbble': 'navigation/0.6.2/de_cbble.nav',
  'de_dust': 'navigation/0.6.2/de_dust.nav',
  'de_inferno': 'navigation/0.6.2/de_inferno.nav',
  'de_nuke': 'navigation/0.6.2/de_nuke.nav',
  'de_prodigy': 'navigation/0.6.2/de_prodigy.nav',
  'de_train': 'navigation/0.6.2/de_train.nav',
};
export const matchbotReleaseHashes = {
  'navigation/0.6.2/de_aztec.nav': '9ab7f6c7002a1821ef1b5f5bb8160f6e4c4d55cfb93dd726d12c8cd63185a7fd',
  'navigation/0.6.2/de_cbble.nav': '8f8412812b0bcb97945072086201f9e4619da85edc03cd8cf9856763a16e9465',
  'navigation/0.6.2/de_dust.nav': '9e040ab23d5ee22887f0580d35f365dee67e393f968a2545784d7c407773555a',
  'navigation/0.6.2/de_inferno.nav': 'e0fbcb07b38500324e7887dd047518ab2c6c6880bd66d0e8c1a867eec7970cdc',
  'navigation/0.6.2/de_nuke.nav': '2b94f4731f0a021556661e038b7e5138f74188a2a81a6c95c0d25d521cbb57c0',
  'navigation/0.6.2/de_prodigy.nav': '6c336f3d1af4b6ee7afcad6e14ea79c0c004ad502e294128c4337fb98e633e06',
  'navigation/0.6.2/de_train.nav': 'fe0a673078812f774f7a93a002371c8145f864fcbd1321e78ff82d717219c445',
  'navigation/0.6.2/manifest.json': 'e803db2773953775f057f49415471e9905dfb39ba518c9d0cf41421f18874c43',

  'releases/0.6.2/resources/bot_profiles-5.30.0.814.zip': '39e6e8a137dbbbdef842cdb4318ef1069b3467127a0cc19bdc6eca1d5d693e38',
  'releases/0.6.2/resources/bot-dependencies.json': 'f62ed12bf6cca8c943bbf4b335177b9b2716251e15ae59164a9cc7674c739dd4',
  'releases/0.6.2/resources/upstream-LICENSE': 'c2ad4def946a60034ae933109dbf5b0470c81872e5952bc81a502ea6e7f8b780',
  'releases/0.6.2/resources/upstream-LICENSE-TRANSITION.md': '95f065ae6d51b35a90c09d70a0e6bb3eaca111bd7de20d4a67d52de48b025333',
  'releases/0.6.2/navigation/nav-proof.json': '4d772b2c95ca34fcaf1dbf8ad525884b1c3722b0eb6d0017fc4fcc4eb2e62571',
  'releases/0.6.2/navigation/de_dust2.nav': '9a44381363572f05d42fa4f82b293f54e49c93d60a4471d2fe8396ecceb77753',

  [MATCHBOT_SOURCE]: 'b838e0968bde5a1667096a09d087b5805f035ef7974c3a7e9c2ecf601cab4908',
  [MATCHBOT_LANGUAGE]: '877007aa9b884af157b69cd8d33c73af00e4d6583f48a588ec5a26b2ce38bf27',
  [MATCHBOT_ARCHIVE]: '3b6aefa4fd827652bc51a82de3eca964ee20ded1dc3bf19b7bd5473fdf48c495',
};
export function matchbotVersionForHash(hash: string): string | null {
  if (hash === matchbotReleaseHashes[MATCHBOT_SOURCE]) return MATCHBOT_VERSION;
  if (hash === '0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e') return '0.4.0';
  if (hash === 'f0062c2ce1915a193830dadcb3a4b3efabf052cd6654bdf3a75cb4ae8bf4b6bb') return '0.4.1';
  if (hash === '0b66608bb29296e101f5191b8a73c5b3d2359e0dc4441f17397d9852df36b490') return '0.5.0';
  if (hash === '6cac5c2f16e8236580ebf8738a95678c60946497571de645a0175293eef6dffb') return '0.5.1';
  if (hash === 'ae8cf6516f4a684d44bff8e21f0a590b1de1988351557450bc76efdfe6d1e82d') return '0.5.2';
  if (hash === 'c53d87ad9078e4a53d56ebad468e54a362f4f1efde8d6c0badfa1da4d46ec89a') return '0.6.1';
  return null;
}
