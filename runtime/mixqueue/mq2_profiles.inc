// CSCO classic competitive profile v1. No ReAPI dependency.
// Optional ReGameDLL features are used only when their CVars exist.
#define MQ2_VERSION "0.3.0"
#define MQ2_PROFILE "cs16-classic-v1"
enum { PROFILE_IDLE, PROFILE_WARMUP, PROFILE_LIVE, PROFILE_OVERTIME };
new gProfile;
new const gProfileNames[][] = {"idle", "warmup", "live", "overtime"};

optional_num(const name[], value) {
    if (cvar_exists(name)) set_cvar_num(name, value);
}

apply_profile(profile) {
    gProfile = profile;
    new bool:warmup = profile == PROFILE_WARMUP;
    // The controller owns scoring, team changes and map rotation.
    set_cvar_num("mp_autoteambalance", 0);
    set_cvar_num("mp_limitteams", 0);
    set_cvar_num("mp_timelimit", 0);
    set_cvar_num("mp_maxrounds", 0);
    set_cvar_num("mp_winlimit", 0);
    set_cvar_num("mp_freezetime", warmup ? 0 : 10);
    set_cvar_float("mp_roundtime", 1.75);
    set_cvar_num("mp_c4timer", 35);
    set_cvar_float("mp_buytime", warmup ? 1.75 : 0.25);
    set_cvar_num("mp_startmoney", warmup ? 16000 : (profile == PROFILE_OVERTIME ? 10000 : 800));
    set_cvar_num("mp_friendlyfire", warmup ? 0 : 1);
    set_cvar_num("mp_fadetoblack", 0);
    set_cvar_num("mp_forcecamera", 2);
    set_cvar_num("mp_forcechasecam", 2);
    set_cvar_num("mp_autokick", 0);
    set_cvar_num("mp_tkpunish", 0);
    set_cvar_num("mp_hostagepenalty", 0);
    set_cvar_num("mp_flashlight", 1);
    set_cvar_num("mp_footsteps", 1);
    set_cvar_num("sv_alltalk", warmup ? 1 : 0);
    set_cvar_num("sv_voiceenable", 1);
    set_cvar_num("sv_cheats", 0);
    set_cvar_num("sv_gravity", 800);
    set_cvar_num("sv_airaccelerate", 10);
    set_cvar_num("sv_maxspeed", 320);
    set_cvar_num("pausable", 0);

    // Reset practice/deathmatch settings before live, including every overtime half.
    optional_num("mp_freeforall", 0);
    optional_num("mp_round_infinite", warmup ? 1 : 0);
    optional_num("mp_forcerespawn", 0); // HamSandwich handles roster-only warmup respawns.
    optional_num("mp_roundrespawn_time", warmup ? -1 : 20);
    optional_num("mp_maxmoney", 16000);
    optional_num("mp_buy_anywhere", warmup ? 1 : 0);
    optional_num("mp_infinite_ammo", 0);
    optional_num("mp_infinite_grenades", 0);
    optional_num("mp_free_armor", 0);
    optional_num("mp_auto_reload_weapons", 0);
    optional_num("mp_refill_bpammo_weapons", 0);
    optional_num("mp_round_restart_delay", 5);
    optional_num("mp_team_flash", 1);
    optional_num("sv_autobunnyhopping", 0);
    optional_num("sv_enablebunnyhopping", 0);
}

bool:profile_ready() {
    new bool:warmup = gProfile == PROFILE_WARMUP;
    if (get_cvar_num("mp_c4timer") != 35 || floatabs(get_cvar_float("mp_roundtime") - 1.75) > 0.001) return false;
    if (get_cvar_num("mp_freezetime") != (warmup ? 0 : 10)) return false;
    if (floatabs(get_cvar_float("mp_buytime") - (warmup ? 1.75 : 0.25)) > 0.001) return false;
    if (get_cvar_num("mp_startmoney") != (warmup ? 16000 : (gProfile == PROFILE_OVERTIME ? 10000 : 800))) return false;
    if (get_cvar_num("mp_friendlyfire") != (warmup ? 0 : 1)) return false;
    if (cvar_exists("mp_forcerespawn") && get_cvar_num("mp_forcerespawn") != 0) return false;
    if (cvar_exists("mp_round_infinite") && get_cvar_num("mp_round_infinite") != (warmup ? 1 : 0)) return false;
    return true;
}
