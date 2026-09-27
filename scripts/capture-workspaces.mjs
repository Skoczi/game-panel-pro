// Actual application components, synthetic documentation data. Start Vite on 4178.
// Requires the backend build for its shared configuration definition.
import {chromium,expect} from '../frontend/node_modules/@playwright/test/index.mjs';
import {cs16GameConfig} from '../backend/dist/templates/gameConfig.js';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../docs/screenshots/',import.meta.url));
const browser=await chromium.launch();
const cfg='// Dust II Classic — public server\nhostname "Dust II Classic | Community"\nmp_timelimit 30\nmp_roundtime 2\nmp_freezetime 3\nmp_buytime 0.25\nmp_startmoney 800\nmp_friendlyfire 0\nmp_autoteambalance 1\nmp_limitteams 2\nsv_alltalk 0\nsv_password ""\nsv_maxrate 100000\nsv_minrate 25000\nsv_maxupdaterate 102\nsv_minupdaterate 30\n';
const nodeId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const hosts=[{name:'macvlan1',parent:'enp6s0',ip:'192.0.2.10',mac:'02:00:00:24:4c:10',status:'active',persistent:true},{name:'macvlan2',parent:'enp6s0',ip:'192.0.2.11',mac:'02:00:00:24:4c:11',status:'active',persistent:true}];
try {
 const page=await browser.newPage({viewport:{width:1680,height:1080},deviceScaleFactor:1});
 await page.addInitScript(()=>localStorage.setItem('theme','dark'));
 await page.route('**/api/**',route=>{
  const u=new URL(route.request().url()),p=u.pathname;
  if(!p.startsWith('/api/'))return route.continue();
  let data={};
  if(p==='/api/branding')data={siteName:'Game Panel PRO',showFollowUs:false,showTrustpilot:false};
  else if(p==='/api/nodes')data={local:{id:'local',name:'FR1',location:'Gravelines, France',origin:'https://panel.example.com',status:'online',agent_version:'2.1.0',last_seen:Date.now(),heartbeat_kind:'panel-response'},nodes:[{id:nodeId,name:'WAW2',location:'Warsaw, Poland',origin:'https://waw2.example.com',status:'online',enabled:1,agent_version:'2.1.0',last_seen:Date.now()},{id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',name:'WAW1',location:'Warsaw, Poland',origin:'https://waw1.example.com',status:'online',enabled:1,agent_version:'2.1.0',last_seen:Date.now()}]};
  else if(p.endsWith('/host-network'))data={available:true,revision:1,entries:hosts,discovered:[],parents:['enp6s0'],autostart:true};
  else if(p.endsWith('/allocations'))data={revision:1,network:{restrictPorts:true,allocations:hosts.map((h,i)=>({ip:h.ip,tcp:'27015-27050',udp:'27015-27050',alias:i?'Match servers':'Community servers'}))},assignments:[],pending:false};
  else if(p.endsWith('/game-config'))data={definition:cs16GameConfig()};
  else if(p.endsWith('/files/roots'))data={roots:[{key:'data',containerPath:'/data'}]};
  else if(p.endsWith('/file'))return route.fulfill({body:cfg,contentType:'text/plain',headers:{ETag:'"documentation"'}});
  else if(p.endsWith('/files'))data={entries:[...['addons','maps','models','sound','sprites'].map(name=>({name,type:'dir'})),...['server.cfg','mapcycle.txt','motd.txt','banned.cfg','listip.cfg'].map((name,i)=>({name,type:'file',size:512+i*238,modifiedAt:'2026-09-28T18:30:00Z'}))]};
  else if(p==='/api/servers/7')data={server:{uptimeSeconds:101340}};
  return route.fulfill({json:data});
 });
 const goto=async section=>page.goto('http://127.0.0.1:4178/test/server-page.fixture.html?documentation#/nodes/local/servers/7/'+section);
 const capture=async name=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(name+' overflows');await page.screenshot({path:output+name+'.png',animations:'disabled'});};
 await goto('console');await expect(page.getByText('hostname: Dust II Classic',{exact:true})).toBeVisible();await page.getByText('Performance history',{exact:true}).click();const handle=await page.getByRole('separator',{name:'Resize console'}).boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y+190,{steps:8});await page.mouse.up();await capture('console-dark');
 await goto('console');await page.getByRole('link',{name:'Game Config',exact:true}).click();await expect(page.getByLabel('Server name',{exact:true})).toHaveValue('Dust II Classic | Community');await page.setViewportSize({width:1680,height:1520});await capture('configuration-form');await page.setViewportSize({width:1680,height:1080});
 await page.getByRole('link',{name:'Nodes',exact:true}).click();await expect(page.getByRole('heading',{name:'WAW2',exact:true})).toBeVisible();await capture('nodes');
 await page.getByRole('button',{name:'Node settings',exact:true}).nth(1).click();await page.getByRole('button',{name:'Network & IPs',exact:true}).click();await expect(page.getByRole('heading',{name:/Configured addresses/})).toBeVisible();await capture('network-allocations');
 await page.getByText('Host interfaces',{exact:true}).click();await page.getByLabel('Additional IPv4',{exact:true}).fill('192.0.2.12');await page.getByLabel('Virtual MAC',{exact:true}).fill('02:00:00:24:4c:12');await page.getByRole('heading',{name:'Additional IP addresses',exact:true}).click();await page.locator('.gp-host-network').screenshot({path:output+'additional-ip.png',animations:'disabled'});
 console.log('Workspace screenshots captured with demonstration data.');
}finally{await browser.close();}
