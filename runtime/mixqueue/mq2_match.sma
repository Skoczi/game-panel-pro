#include <amxmodx>
#include <amxmisc>
#include <cstrike>
#include <hamsandwich>
#include "mq2_profiles.inc"

// The per-player JSON snapshot needs more than AMXX's default 4K-cell stack.
#pragma dynamic 8192

#define MAX_ROSTER 10
new gMatch[40],gMap[40],gGeneration,gSize,gMR,gOT,gState,gScore[2],gCT=0,gRound,gSeq,gBoot;
new gSteam[MAX_ROSTER][36],gSteam64[MAX_ROSTER][24],gTeam[MAX_ROSTER],gReady[MAX_ROSTER];
new gKills[MAX_ROSTER],gDeaths[MAX_ROSTER],gDamage[MAX_ROSTER],gHS[MAX_ROSTER],gRounds[MAX_ROSTER];
new gClient[33],gConfig[192],gDirectory[160],gJournal[192],gActive[192];
new Float:gIgnoreUntil;
new gHash[65];
new bool:gStarting, bool:gIntermission;
new bool:gTest, gRoster;
// 0 idle, 1 warmup, 2 live, 3 finished, 4 recovery quarantine.

public plugin_init() {
    register_plugin("MixQueue2 Match Controller",MQ2_VERSION,"CSCO");
    register_event("HLTV","round_start","a","1=0","2=0");
    RegisterHam(Ham_Killed,"player","warmup_killed",1);
    RegisterHam(Ham_Spawn,"player","warmup_spawned",1);
    register_srvcmd("mq2_status","status_cmd");register_srvcmd("mq2_load","load_cmd");register_srvcmd("mq2_clear","clear_cmd");
    register_clcmd("say /ready","ready_cmd");register_clcmd("say .ready","ready_cmd");register_clcmd("say /r","ready_cmd");
    register_clcmd("jointeam","block_team");register_clcmd("chooseteam","block_team");
    register_event("SendAudio","ct_win","a","2=%!MRAD_ctwin");register_event("SendAudio","t_win","a","2=%!MRAD_terwin");
    register_event("DeathMsg","death_event","a");register_event("Damage","damage_event","b","2!0");
    get_configsdir(gDirectory,charsmax(gDirectory));add(gDirectory,charsmax(gDirectory),"/mq2");mkdir(gDirectory);
    formatex(gActive,charsmax(gActive),"%s/active.txt",gDirectory);
    new data[160];get_datadir(data,charsmax(data));add(data,charsmax(data),"/mq2");mkdir(data);
    formatex(gJournal,charsmax(gJournal),"%s/events.jsonl",data);
    new f=fopen(gJournal,"at");if(!f)set_fail_state("Cannot open MQ2 journal");fclose(f);
    gBoot=random_num(1,2147483646);
    for(new i=0;i<33;i++)gClient[i]=-1;
}
public plugin_cfg() {
    if(!file_exists(gActive)){apply_profile(PROFILE_IDLE);return;}
    new f=fopen(gActive,"rt"),line[230],phase[12];fgets(f,line,charsmax(line));fclose(f);
    parse(line,gConfig,charsmax(gConfig),phase,charsmax(phase));
    if(!read_config()) {gState=4;apply_profile(PROFILE_IDLE);return;}
    gState=str_to_num(phase)==1?1:4;
    new map[40];get_mapname(map,charsmax(map));
    if(gState==1 && equal(map,gMap)) {apply_profile(PROFILE_WARMUP);emit_loaded();} else {gState=4;apply_profile(PROFILE_IDLE);}
}
bool:safe_id(const text[]) {
    if(strlen(text)!=24)return false;
    for(new i=0;i<24;i++)if(!(text[i]>='0'&&text[i]<='9')&&!(text[i]>='a'&&text[i]<='f'))return false;
    return true;
}
bool:read_config() {
    new f=fopen(gConfig,"rt");if(!f)return false;
    new line[240],gen[16],size[8],mr[8],ot[8],test[8];fgets(f,line,charsmax(line));
    parse(line,gMatch,charsmax(gMatch),gen,charsmax(gen),gMap,charsmax(gMap),size,charsmax(size),mr,charsmax(mr),ot,charsmax(ot),gHash,charsmax(gHash),test,charsmax(test));
    gGeneration=str_to_num(gen);gSize=str_to_num(size);gMR=str_to_num(mr);gOT=str_to_num(ot);
    if(!safe_id(gMatch)||gGeneration<1||(gSize!=2&&gSize!=5)||gMR!=(gSize==2?8:15)||gOT!=3||!is_map_valid(gMap)){fclose(f);return false;}
    gTest=equal(test,"1")==1;gRoster=gTest?1:gSize*2;
    for(new i=0;i<gRoster;i++){
        new team[8];
        if(feof(f)) {
            fclose(f);
            return false;
        }
        fgets(f,line,charsmax(line));
        parse(line,gSteam[i],charsmax(gSteam[]),gSteam64[i],charsmax(gSteam64[]),team,charsmax(team));gTeam[i]=str_to_num(team)-1;
        if((gTeam[i]!=0&&gTeam[i]!=1)||containi(gSteam[i],"STEAM_0:")!=0){fclose(f);return false;}
    }
    fclose(f);return true;
}
persist() {new f=fopen(gActive,"wt");if(!f)set_fail_state("Cannot persist match state");fprintf(f,"%s %d^n",gConfig,gState);fflush(f);fclose(f);}
emit(const type[],const data[],const stable[]="") {
    if(!safe_id(gMatch))return;
    new eid[90];if(stable[0])formatex(eid,charsmax(eid),"%s:%d:%s",gMatch,gGeneration,stable);else formatex(eid,charsmax(eid),"%s:%d:%d:%d",gMatch,gGeneration,gBoot,++gSeq);
    new f=fopen(gJournal,"at");if(!f)set_fail_state("Journal write failed");
    fprintf(f,"{^"event_id^":^"%s^",^"match_id^":^"%s^",^"generation^":%d,^"type^":^"%s^",^"data^":%s}^n",eid,gMatch,gGeneration,type,data);fflush(f);fclose(f);
}
emit_loaded(){new data[210];formatex(data,charsmax(data),"{^"map^":^"%s^",^"config_hash^":^"%s^"}",gMap,gHash);emit("loaded",data,"loaded");}
connection(slot,bool:value){new data[120];formatex(data,charsmax(data),"{^"steam_id^":^"%s^",^"connected^":%s}",gSteam64[slot],value?"true":"false");emit("connected",data);}
public load_cmd(){
    new id[40],gen[16];read_argv(1,id,charsmax(id));read_argv(2,gen,charsmax(gen));
    if(!safe_id(id)||str_to_num(gen)<1)return;
    if(gState){server_print("busy");return;}
    formatex(gConfig,charsmax(gConfig),"%s/%s-%d.txt",gDirectory,id,str_to_num(gen));
    if(!read_config()){server_print("invalid_config");return;}
    gStarting=false;gIntermission=false;gState=1;gScore[0]=0;gScore[1]=0;gCT=0;gRound=0;
    arrayset(gReady,0,MAX_ROSTER);arrayset(gKills,0,MAX_ROSTER);arrayset(gDeaths,0,MAX_ROSTER);arrayset(gDamage,0,MAX_ROSTER);arrayset(gHS,0,MAX_ROSTER);arrayset(gRounds,0,MAX_ROSTER);
    persist();new map[40];get_mapname(map,charsmax(map));
    if(!equal(map,gMap)){server_cmd("changelevel %s",gMap);return;}
    apply_profile(PROFILE_WARMUP);server_cmd("sv_restartround 1");emit_loaded();for(new i=1;i<=32;i++)if(is_user_connected(i))authorize_player(i);
}
public status_cmd(){
    new players[32],count;get_players(players,count,"ch");
    new full[64];if(gState)formatex(full,charsmax(full),"%s:%d",gMatch,gGeneration);
    new const phases[][]={"idle","warmup","live","finished","recovery"};
    server_print("{^"bridge^":1,^"solo_test^":true,^"matchid^":^"%s^",^"idle^":%s,^"healthy^":%s,^"controller_version^":^"%s^",^"phase^":^"%s^",^"profile^":^"%s^",^"rules_phase^":^"%s^",^"rules_ready^":%s,^"score^":[%d,%d]}",
        full,(!gState&&!count)?"true":"false",gState==4?"false":"true",MQ2_VERSION,gStarting?"starting":phases[gState],MQ2_PROFILE,gProfileNames[gProfile],profile_ready()?"true":"false",gScore[0],gScore[1]);
}
public clear_cmd(){
    remove_task(701);gStarting=false;gIntermission=false;apply_profile(PROFILE_IDLE);gState=0;gMatch[0]=0;if(file_exists(gActive))delete_file(gActive);
    for(new i=1;i<=32;i++)if(is_user_connected(i))server_cmd("kick #%d ^"Match ended^"",get_user_userid(i));
}
public client_authorized(id,const authid[]){authorize_player(id);}
authorize_player(id){
    gClient[id]=-1;new auth[36];get_user_authid(id,auth,charsmax(auth));
    if(!gState||gState==4||is_user_bot(id)){server_cmd("kick #%d ^"Join a CSCO match first^"",get_user_userid(id));return;}
    // STEAM_1 and STEAM_0 differ only in universe notation for this engine.
    if(containi(auth,"STEAM_1:")==0)auth[6]='0';
    for(new i=0;i<gRoster;i++)if(equal(auth,gSteam[i])){gClient[id]=i;break;}
    if(gClient[id]<0){server_cmd("kick #%d ^"Not in this match^"",get_user_userid(id));return;}
    set_task(1.0,"assign_team",id);connection(gClient[id],true);
}
public assign_team(id){
    if(!is_user_connected(id)||gClient[id]<0)return;
    cs_set_user_team(id,gTeam[gClient[id]]==gCT?CS_TEAM_CT:CS_TEAM_T);
    if(gState==1 && !gStarting && !is_user_alive(id)) {remove_task(900+id);set_task(1.0,"warmup_respawn",900+id);}
}
public warmup_killed(id) {
    if(gState==1 && !gStarting && gClient[id]>=0) {remove_task(900+id);set_task(2.0,"warmup_respawn",900+id);}
}
public warmup_respawn(task) {
    new id=task-900;
    if(gState==1 && !gStarting && is_user_connected(id) && !is_user_alive(id) && gClient[id]>=0)
        ExecuteHamB(Ham_CS_RoundRespawn,id);
}
public warmup_spawned(id) {
    if(gState==1 && !gStarting && is_user_alive(id) && gClient[id]>=0) cs_set_user_money(id,16000,0);
}
public client_disconnected(id){
    if(gClient[id]>=0&&(gState==1||gState==2)){
        connection(gClient[id],false);gReady[gClient[id]]=0;
    }
    gClient[id]=-1;remove_task(id);remove_task(900+id);
}
public block_team(id){
    if(gState&&gClient[id]>=0){
        assign_team(id);
        return PLUGIN_HANDLED;
    }
    return PLUGIN_CONTINUE;
}
public ready_cmd(id){
    if(gState!=1||gStarting||gClient[id]<0)return PLUGIN_HANDLED;
    gReady[gClient[id]]=1;client_print(0,print_chat,"[CSCO] Player ready. Type /ready to start.");
    new connected=0;for(new i=1;i<=32;i++)if(is_user_connected(i)&&gClient[i]>=0)connected++;
    if(connected!=gRoster)return PLUGIN_HANDLED;
    for(new i=0;i<gRoster;i++)if(!gReady[i])return PLUGIN_HANDLED;
    start_live();return PLUGIN_HANDLED;
}
start_live() {
    apply_profile(PROFILE_LIVE);gStarting=true;server_cmd("sv_restartround 1");
}
public round_start() {
    if(gStarting && gState==1) {
        gStarting=false;gState=2;persist();gIgnoreUntil=get_gametime();
        emit("live","{}","live");
        client_print(0,print_chat,"[CSCO] LIVE! MR%d | Good luck, have fun.",gMR);
    }
    gIntermission=false;
}
public death_event(){if(gState!=2||gIntermission||get_gametime()<gIgnoreUntil)return;new killer=read_data(1),victim=read_data(2);if(victim<1||victim>32||gClient[victim]<0)return;gDeaths[gClient[victim]]++;if(killer>0&&killer<=32&&killer!=victim&&gClient[killer]>=0&&gTeam[gClient[killer]]!=gTeam[gClient[victim]]){gKills[gClient[killer]]++;if(read_data(3))gHS[gClient[killer]]++;}}
public damage_event(id){if(gState!=2||gIntermission||get_gametime()<gIgnoreUntil||gClient[id]<0)return;new attacker=get_user_attacker(id);if(attacker>0&&attacker<=32&&gClient[attacker]>=0&&gTeam[gClient[attacker]]!=gTeam[gClient[id]])gDamage[gClient[attacker]]+=read_data(2);}
public ct_win(){round_win(gCT);}public t_win(){round_win(1-gCT);}
round_win(team){
    if(gState!=2||gIntermission||get_gametime()<gIgnoreUntil)return;
    gIgnoreUntil=get_gametime()+2.0;gScore[team]++;gRound++;
    for(new i=1;i<=32;i++)if(is_user_connected(i)&&gClient[i]>=0)gRounds[gClient[i]]++;
    new high=max(gScore[0],gScore[1]),low=min(gScore[0],gScore[1]);
    new bool:finished=(high==gMR+1&&low<gMR);
    if(low>=gMR&&high>gMR+1){new period=(low-gMR)/gOT;finished=high==gMR+(period+1)*gOT+1&&low<=gMR+(period+1)*gOT-1;}
    scores(finished?"finished":"round");
    if(finished){gState=3;persist();client_print(0,print_chat,"[CSCO] Match finished: %d:%d",gScore[0],gScore[1]);return;}
    if(gRound==gMR||(gRound>gMR*2&&(gRound-gMR*2)%gOT==0)){gIntermission=true;gCT=1-gCT;set_task(2.5,"restart_half",701);}
    else if(gRound==gMR*2){gIntermission=true;set_task(2.5,"restart_half",701);}
}
public restart_half(){if(gState!=2)return;for(new i=1;i<=32;i++)if(is_user_connected(i))assign_team(i);apply_profile(gRound>=gMR*2?PROFILE_OVERTIME:PROFILE_LIVE);gIgnoreUntil=get_gametime()+1.0;server_cmd("sv_restartround 1");}
scores(const type[]){
    new stats[2400],part[230],data[2600],stable[40];
    for(new i=0;i<gRoster;i++){formatex(part,charsmax(part),"%s^"%s^":{^"kills^":%d,^"deaths^":%d,^"damage^":%d,^"headshots^":%d,^"rounds^":%d}",i?",":"",gSteam64[i],gKills[i],gDeaths[i],gDamage[i],gHS[i],gRounds[i]);add(stats,charsmax(stats),part);}
    formatex(data,charsmax(data),"{^"team1_score^":%d,^"team2_score^":%d,^"players^":{%s}}",gScore[0],gScore[1],stats);
    formatex(stable,charsmax(stable),"%s-%d-%d",type,gScore[0],gScore[1]);emit(type,data,stable);
}
