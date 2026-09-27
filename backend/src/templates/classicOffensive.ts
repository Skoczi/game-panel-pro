import { SOURCE_TEMPLATES } from './sourceTemplates.js';
import { sourceGameConfig } from './sourceProfile.js';
import type { GameTemplate } from './types.js';

export const CLASSIC_PACKAGE = { package: 'classic-offensive-1_0_2', sha256: '928e35bab55e1bfdbc35cdc37b1fbc9201205d29db140fc126375f2e03b37ad1' };
const csgo = SOURCE_TEMPLATES.find(t => t.id === 'builtin-csgo-native')!.document;
export const CLASSIC_OFFENSIVE_TEMPLATE: GameTemplate = {
  ...csgo,
  name: 'Classic Offensive', description: '', source: 'Classic Offensive 1.0.2 / AlliedModders',
  runtime: {...csgo.runtime, catalogId: 'classic', image: 'gamepanel-runtime:classic-1.0.2'},
  variables: csgo.variables.filter(v => !['GAME_TYPE','GAME_MODE','MAP_GROUP'].includes(v.key)).map(v => v.key === 'MAP' ? {...v,default:'de_dust2_csco'} : v),
  mounts: [
    {key:'data',containerPath:'/data'},
    {key:'classic_base',containerPath:'/opt/classic-base',shared:{...CLASSIC_PACKAGE,path:'.'}},
    ...['bin','csgo','platform','csco/csgo/vpks'].map(p=>({key:'classic_'+p.split('/').join('_'),containerPath:'/data/serverfiles/'+p,shared:{...CLASSIC_PACKAGE,path:p}})),
  ],
  lifecycle: {
    startup:['/usr/local/lib/gamepanel/classic-start'], installerImage:'gamepanel-runtime:classic-1.0.2',
    install:[{name:'Install Classic Offensive from shared files',argv:['/usr/local/lib/gamepanel/classic-install','install'],timeoutSeconds:1800}],
    update:[{name:'Verify Classic Offensive shared package',argv:['/usr/local/lib/gamepanel/classic-install','verify'],timeoutSeconds:300}],
    workdir:'/data',stopCommand:'quit',stopSignal:'SIGINT',stopTimeoutSeconds:30,
  },
  gameConfig: sourceGameConfig('classic'),
  configFiles:[{root:'data',path:'/serverfiles/csco/csgo/cfg/server.cfg',label:'Server settings'},{root:'data',path:'/serverfiles/csco/csgo/mapcycle.txt',label:'Map rotation'}],
  fastDownload:{...csgo.fastDownload!,gameRoot:'serverfiles/csco/csgo',configFile:'serverfiles/csco/csgo/cfg/server.cfg'},
};

