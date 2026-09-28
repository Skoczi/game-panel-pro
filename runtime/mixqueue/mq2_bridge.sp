#pragma semicolon 1
#pragma newdecls required
#include <sourcemod>
#include <get5>

public Plugin myinfo = {name="MixQueue2 journal bridge", author="CSCO", description="Durable local match events", version="0.2.0"};
char gJournal[PLATFORM_MAX_PATH];
char gLoaded[64];
int gSequence;
int gBoot;

public void OnPluginStart() {
    char directory[PLATFORM_MAX_PATH];
    BuildPath(Path_SM, directory, sizeof(directory), "data/mq2");
    if (!DirExists(directory)) CreateDirectory(directory, 0750);
    BuildPath(Path_SM, gJournal, sizeof(gJournal), "data/mq2/events.jsonl");
    File file = OpenFile(gJournal, "a");
    if (file == null) SetFailState("Cannot open durable event journal");
    delete file;
    gBoot = GetURandomInt();
    RegAdminCmd("mq2_status", CommandStatus, ADMFLAG_ROOT);
    RegAdminCmd("mq2_clear", CommandClear, ADMFLAG_ROOT);
    CreateTimer(1.0, Observe, _, TIMER_REPEAT);
}

bool ReadAssignment(char[] match, int length, int &generation) {
    char full[64], parts[2][40];
    Get5_GetMatchID(full, sizeof(full));
    if (ExplodeString(full, ":", parts, 2, 40) != 2 || strlen(parts[0]) != 24) return false;
    for (int i=0; i<24; i++) if (!IsCharNumeric(parts[0][i]) && (parts[0][i]<'a' || parts[0][i]>'f')) return false;
    generation=StringToInt(parts[1]);
    strcopy(match, length, parts[0]);
    return generation>0;
}

void Emit(const char[] type, const char[] data, const char[] stable="") {
    char match[40], eventId[81]; int generation;
    if (!ReadAssignment(match, sizeof(match), generation)) return;
    if (stable[0]) Format(eventId, sizeof(eventId), "%s:%d:%s", match, generation, stable);
    else Format(eventId, sizeof(eventId), "%s:%d:%x:%d", match, generation, gBoot, ++gSequence);
    File file=OpenFile(gJournal,"a");
    if (file==null) SetFailState("Journal unavailable: refusing to lose match events");
    file.WriteLine("{\"event_id\":\"%s\",\"match_id\":\"%s\",\"generation\":%d,\"type\":\"%s\",\"data\":%s}",eventId,match,generation,type,data);
    file.Flush();
    delete file;
}

void Connected(int client, bool value) {
    if (IsFakeClient(client)) return;
    char steam[32], data[128];
    if (!GetClientAuthId(client,AuthId_SteamID64,steam,sizeof(steam))) return;
    if (Get5_GetPlayerTeam(steam)!=Get5Team_1 && Get5_GetPlayerTeam(steam)!=Get5Team_2) return;
    Format(data,sizeof(data),"{\"steam_id\":\"%s\",\"connected\":%s}",steam,value?"true":"false");
    Emit("connected",data);
}

void EnsureLoaded() {
    char id[64], map[128], data[300];
    Get5_GetMatchID(id,sizeof(id));
    if (!id[0] || StrEqual(gLoaded,id)) return;
    GetCurrentMap(map,sizeof(map));
    char expectedPath[PLATFORM_MAX_PATH], expected[300], parts[3][100];
    BuildPath(Path_SM,expectedPath,sizeof(expectedPath),"configs/mq2/expected.txt");
    File expectedFile=OpenFile(expectedPath,"r");
    if(expectedFile==null) return;
    expectedFile.ReadLine(expected,sizeof(expected));delete expectedFile;TrimString(expected);
    if(ExplodeString(expected," ",parts,3,100)!=3 || !StrEqual(parts[0],id) || !StrEqual(parts[1],map) || strlen(parts[2])!=64) return;
    // Map names contain only engine path characters; reject anything unsafe for JSON.
    if (StrContains(map,"\"")!=-1 || StrContains(map,"\\")!=-1) return;
    Format(data,sizeof(data),"{\"map\":\"%s\",\"config_hash\":\"%s\"}",map,parts[2]);
    Emit("loaded",data,"loaded");
    strcopy(gLoaded,sizeof(gLoaded),id);
    for(int i=1;i<=MaxClients;i++) if(IsClientInGame(i)) Connected(i,true);
}

public Action Observe(Handle timer) {
    Get5State state=Get5_GetGameState();
    if(state==Get5State_None) gLoaded[0]='\0';
    else if(state==Get5State_Warmup) EnsureLoaded();
    return Plugin_Continue;
}

public Action CommandStatus(int client,int args) {
    if(client!=0) {ReplyToCommand(client,"RCON only");return Plugin_Handled;}
    char match[40], full[64], map[128];int generation;
    bool valid=ReadAssignment(match,sizeof(match),generation);
    GetCurrentMap(map,sizeof(map));
    if(valid) Format(full,sizeof(full),"%s:%d",match,generation);
    else Get5_GetMatchID(full,sizeof(full));
    if(Get5_GetGameState()==Get5State_None) full[0]='\0';
    // Never serialize an arbitrary externally loaded identity.
    if(full[0]&&!valid) {ReplyToCommand(client,"{\"bridge\":1,\"matchid\":\"foreign\",\"idle\":false}");return Plugin_Handled;}
    int humans;for(int i=1;i<=MaxClients;i++)if(IsClientConnected(i)&&!IsFakeClient(i))humans++;
    ReplyToCommand(client,"{\"bridge\":1,\"matchid\":\"%s\",\"idle\":%s}",full,Get5_GetGameState()==Get5State_None&&humans==0?"true":"false");
    return Plugin_Handled;
}
public Action CommandClear(int client,int args) {
    if(client!=0) return Plugin_Handled;
    if(Get5_GetGameState()!=Get5State_None) {ServerCommand("get5_endmatch");ServerExecute();}
    for(int i=1;i<=MaxClients;i++)if(IsClientConnected(i)&&!IsFakeClient(i))KickClient(i,"Match ended");
    ReplyToCommand(client,"clearing");return Plugin_Handled;
}

public void Get5_OnGameStateChanged(const Get5GameStateChangedEvent event) {
    if(event.NewState==Get5State_Live) {EnsureLoaded();Emit("live","{}","live");}
}

public void Get5_OnPlayerConnected(const Get5PlayerConnectedEvent event) {
    if(!gLoaded[0]) return;
    char steam[32],data[128];event.Player.GetSteamId(steam,sizeof(steam));
    if(Get5_GetPlayerTeam(steam)!=Get5Team_1&&Get5_GetPlayerTeam(steam)!=Get5Team_2) return;
    Format(data,sizeof(data),"{\"steam_id\":\"%s\",\"connected\":true}",steam);Emit("connected",data);
}
public void Get5_OnPlayerDisconnected(const Get5PlayerDisconnectedEvent event) {
    if(!gLoaded[0]) return;
    Get5State state=Get5_GetGameState();
    if(state==Get5State_None||state==Get5State_PostGame) return;
    char steam[32],data[128];event.Player.GetSteamId(steam,sizeof(steam));
    if(Get5_GetPlayerTeam(steam)!=Get5Team_1&&Get5_GetPlayerTeam(steam)!=Get5Team_2) return;
    Format(data,sizeof(data),"{\"steam_id\":\"%s\",\"connected\":false}",steam);Emit("connected",data);
}

void Stats(Get5StatsTeam team,char[] output,int length,bool &first) {
    JSON_Array players=team.Players;
    for(int i=0;i<players.Length;i++) {
        Get5StatsPlayer p=view_as<Get5StatsPlayer>(players.GetObject(i));
        Get5PlayerStats stats=p.Stats;char steam[32],part[300];p.GetSteamId(steam,sizeof(steam));
        Format(part,sizeof(part),"%s\"%s\":{\"kills\":%d,\"deaths\":%d,\"assists\":%d,\"damage\":%d,\"rounds\":%d,\"headshots\":%d}",first?"":",",steam,stats.Kills,stats.Deaths,stats.Assists,stats.Damage,stats.RoundsPlayed,stats.HeadshotKills);
        StrCat(output,length,part);first=false;
    }
}
void Scores(Get5StatsTeam a,Get5StatsTeam b,const char[] type) {
    char stats[8000],data[8400],stable[40];bool first=true;
    Stats(a,stats,sizeof(stats),first);Stats(b,stats,sizeof(stats),first);
    Format(data,sizeof(data),"{\"team1_score\":%d,\"team2_score\":%d,\"players\":{%s}}",a.Score,b.Score,stats);
    Format(stable,sizeof(stable),"%s-%d-%d",type,a.Score,b.Score);
    Emit(type,data,stable);
}
public void Get5_OnRoundEnd(const Get5RoundEndedEvent event) {if(Get5_GetGameState()==Get5State_Live)Scores(event.Team1,event.Team2,"round");}
public void Get5_OnMapResult(const Get5MapResultEvent event) {Scores(event.Team1,event.Team2,"finished");}
public void Get5_OnPauseBegan(const Get5MatchPauseBeganEvent event) {if(Get5_GetGameState()==Get5State_Live)Emit("pause","{}");}
public void Get5_OnMatchUnpaused(const Get5MatchUnpausedEvent event) {if(Get5_GetGameState()==Get5State_Live)Emit("resume","{}");}
