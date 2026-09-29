# Profile CS 1.6 w 0.6.3 — pochodzenie i wyjątki

Bazą jest zestaw wartości ESL przekazany i zaakceptowany przez użytkownika.
To opis konfiguracji CSCO, nie potwierdzenie zgodności z aktualnym regulaminem
ligi. Implementacja jest w `MatchBot/MatchCSCOSafety.h` w archiwum źródeł;
ustawienia wynikają z podpisanego trybu, a nie z liczby obecnych graczy.
Kontroler nie wykonuje i nie nadpisuje ręcznie utrzymywanego starego esl.cfg.

| Parametr w LIVE | 5v5 | 2v2 |
| --- | --- | --- |
| `mp_roundtime` | 1.75 min | 2 min |
| `mp_freezetime` | 10 s | 8 s |
| `sv_maxrate` | 30000 | 25000 |
| `sv_maxupdaterate` | 102 | 100 |
| `sv_minrate` | 2500 | 2500 |
| `sv_minupdaterate` | 20 | 20 |

Testy nadpisują aktywny czas rundy na `mp_roundtime 0.5` (30 s). Warmup
nie jest rundą testową: zachowuje własne nieskończone rundy i respawn,
freeze 0, pieniądze 16000, wyłączony friendly fire, zakup z dowolnego miejsca
i rozmowę wszystkich. Przy przejściu do LIVE kontroler stosuje właściwy profil.
Startmoney w LIVE wynosi 800, w dogrywce 10000. C4 ma 35 s, zakup 15 s.
Podłożona bomba może przedłużyć rundę poza nominalne 30 s.

Przerwa między połowami i przed rozpoczęciem dogrywki wynosi 20 s.
Kontroler informuje po polsku lub angielsku o remisie i dogrywce MR3.
Próg remisu wynika z trybu (MR15 dla 5v5, MR8 dla 2v2); aktywne rundy
dogrywki nadal mają właściwy czas profilu, a testy 30 s.

Po naturalnym wyniku lub poddaniu CS 1.6 zachowuje serwer przez 180 s
na screeny i gg. To stan finished z zamkniętym punktowaniem i zatrzymanym
restartem rundy, nie nowa rozgrzewka. WWW zapisuje wynik od razu i trwale
opóźnia cleanup; sam timer kontrolera nie zwalnia przypisania. Naturalne
full_test i solo działają tak samo. Operacyjne zakończenia, ręczny End test,
abort, wygaśnięcie testu i błąd serwera pozostają natychmiastowe.

Głos pozostaje włączony przez `sv_voiceenable 1`. `pausable 0` blokuje zwykłą
pauzę silnika; pauzy kapitańskie i systemowe wykonuje kontroler. Nie oznacza
to wyłączenia `/pause`, `/timeout` lub uzgodnionego `/unpause`.

Klasyczne zabezpieczenia ReGameDLL obejmują:

- Obrażenia od upadku 1, `mp_roundover 0`, `mp_fraglimit 0`, automatyczny
  bunnyhop i rozszerzony bunnyhop 0, losowy spawn i odporność po spawnie 0.
- `mp_plant_c4_anywhere 0`, `mp_give_player_c4 1`, `mp_defuser_allocation 0`,
  `mp_hegrenade_penetration 0` i `mp_mirrordamage 0`, gdy cvar istnieje.
  `mp_mirrordamage` jest opcjonalny, ponieważ kompilacja z FIXES może
  go nie udostępniać; zachowujemy poprawki GameDLL.
- Klasyczne mnożniki friendly fire: bullets 0.35, grenade 0.25,
  grenade_self 1 i other 0.35. Wartość other odpowiada klasycznemu
  mnożnikowi GameDLL i konfiguracji dystrybucyjnej. Friendly fire w LIVE
  pozostaje włączony.
- Bez dodatkowych respawnów, nieskończonych rund/amunicji/granatów,
  automatycznego przeładowania, uzupełniania amunicji i darmowego pancerza
  w LIVE. Specjalne warunki warmup oraz pauzy obsługuje kontroler.
- Domyślny ekwipunek: CT — USP, T — Glock18, nóż po obu stronach;
  bez dodatkowej broni głównej, granatów i losowego zestawu na spawnie.
- `mp_allow_point_servercommand 0`. Opcjonalne rozszerzone pola TAB
  w kompilacjach BUILD_LATEST: zdrowie i pieniądze -1, defkit 0;
  brak tych opcjonalnych cvar nie wymaga wyłączenia pozostałych reguł.

`mp_consistency 1` jest prawidłowym ustawieniem serwera; nie zastępuj go
nieistniejącym odpowiednikiem `sv_consistency`. `mp_decals` i `sv_airmove`
nie występują w przypiętym ReHLDS/ReGameDLL, dlatego nie zostały dodane
jako reguły wymagające ciągłego przywracania.

`log on` jest poleceniem, a nie cvar. Host uruchamia je raz ze swojej
konfiguracji startowej. Każde kolejne wywołanie otwiera nowy plik logu;
kontroler nie powinien wysyłać go cyklicznie. Pozostałe ustawienia logowania
w profilu to `mp_logdetail 3`, `mp_logecho 0`, `mp_logfile 1`,
`mp_logmessages 1`. Przykład scalania to HOST-STARTUP.example.cfg.

Ta specyfikacja opisuje wymagane działanie. Potwierdzone przypadki końcowej
binarki i ograniczenia odbioru są wyłącznie w ACCEPTANCE.md. Rzeczywisty
przebieg gry, głos, pauzy i prezentację zegara sprawdza się osobno od
odczytu cvar. Nie należy przenosić wyników odbioru starszej wersji na 0.6.3.
