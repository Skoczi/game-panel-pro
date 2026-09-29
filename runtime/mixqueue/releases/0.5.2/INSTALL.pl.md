# MatchBot CSCO 0.5.2 — Linux i386

Kontroler turniejowy CS 1.6 oparty na MatchBot 1.0.6 (GPL-3.0), commit
`690f98c02e9806905126740d70b67da50d0903e6`.
Źródło: https://github.com/SmileYzn/MatchBot

## Wymagania i instalacja

1. Zatrzymaj pusty serwer. Zrób kopię katalogu serwera, list pluginów,
   konfiguracji agenta i jego bazy SQLite. Nie resetuj dziennika ani bazy agenta.
2. Wymagane są ReHLDS, ReGameDLL_CS oraz Metamod. Weryfikowana kombinacja:
   ReHLDS 3.15.0.896, ReGameDLL 5.30.0.814 i Metamod-r 1.3.0.149.
   Binarka wymaga Linux i386 z glibc 2.36 lub nowszą (sprawdź `ldd --version`).
   Biblioteki C++ są dołączone statycznie; nie zastępuj bibliotek Steam w katalogu gry.
3. Usuń lub zakomentuj wpis `mq2_match.amxx` w `addons/amxmodx/configs/plugins.ini`.
   Zachowaj też potwierdzone wyłączenie dokładnie `statsx.amxx`: przechwytuje
   `/stats` i `/score` przed `ReGameDLL_InternalCommand`. Nie wyłączaj całego AMXX.
   Wyłącz też inne kontrolery meczu, autobalans, deathmatch, respawn i wymuszanie drużyn.
   Pozostałe pluginy AMXX mogą zostać; sam nowy kontroler nie wymaga AMXX ani ReAPI.amxx.
4. Wgraj `addons/matchbot/` z paczki do katalogu `cstrike/`.
   Dopisz do **istniejącego** `cstrike/addons/metamod/plugins.ini`:

   `linux addons/matchbot/dlls/matchbot_csco_mm.so`

   Nie nadpisuj całej listy pluginów. Nie wgrywaj binarki QA z drzewa kompilacji.
5. Najpierw wymagane jest WWW MixQueue2 0.6.5 i agent 0.5.1. Agent pozostaje bez zmian. Przebuduj obraz instalatora tylko wtedy, gdy osadza paczkę kontrolera. Pole konfiguracji `adapter: "amxx"`
   pozostaje zgodne z dotychczasowym protokołem; nie oznacza rodzaju nowej binarki.
   Zachowaj `server_id`, klucz, RCON, `game_root`, journal i spool SQLite.
   Własny runner ESERV musi używać `agent.dispatch`, a executor mieć dostęp
   tylko do odczytu rzeczywistych `maps/*.bsp`. Szczegóły w PROMPT-ESERV.md.
6. Uruchom serwer. `meta list` ma pokazać **MatchBot CSCO 0.5.2 RUN**.
   `mq2_status` ma zwracać `controller: "matchbot"`, `healthy: true`,
   `rules_ready: true`, a na pustym serwerze także `idle: true`.
   Pole `agent_protocol: 2` dodaje agent do obserwacji dla strony WWW.
   Agent raportuje też `map_inventory`: brak aktualnej, zweryfikowanej listy
   map blokuje nowe testy. Pełne veto wymaga co najmniej trzech wspólnych map
   z puli trybu, konfiguracji serwera i jego rzeczywistych plików BSP.
7. Przeprowadź pełny test 1+9 i 2+8 w Matchmaking → Panel, następnie odbiór meczu z ludźmi.
   Publiczne kolejki pozostają wyłączone.

## Przebieg meczu

- Skład i mapa pochodzą z CSCO. SteamID decyduje o drużynie; gracz nie wybiera jej sam.
- Rozgrzewka: odradzanie i 16 000 $. `/ready` wszystkich uruchamia trzy restarty.
- 5v5: MR15; 2v2: MR8. Runda 1:45, freeze 10 s, zakup 15 s, C4 35 s,
  800 $ na początek połowy. Dogrywki MR3 / 10 000 $, powtarzane przy remisie.
- Wynik w TAB i `/score`; `/dmg`, `/hp`, `/timeout`, `/unready`, `/help`.
  Timeout tylko kapitana; /unpause wymaga obu kapitanów. 60 s na początku kolejnej rundy, dwa na drużynę.
  Rozłączenie: 90 s pauzy przed kolejną rundą, następnie 180 s na powrót.
  Po przekroczeniu terminu: jednorazowa blokada nowych meczów na 30 minut.
  Powrót przed terminem anuluje odliczanie; powrót po terminie pozwala dokończyć
  ten mecz, ale zachowuje blokadę nowych meczów. Nakładające się rozłączenia
  współdzielą trwającą pauzę. Ten sam ciągły brak gracza nie uruchamia pauzy co rundę.
- Po porzuceniu i przy brakującym graczu `/ff` rozpoczyna 30-sekundowe głosowanie.
  `/yes`, `/no` lub menu 1/2. Wygrywa ścisła większość pozostałego składu:
  3/4, 2/3, 2/2, 1/1. Odłączenie głosującego nie obniża progu i usuwa jego głos.
  Kolejna próba po 120 s. Rozstrzygnięty mecz zachowuje rozegrany wynik rund;
  poddająca się drużyna przegrywa również przy prowadzeniu. ELO rozlicza WWW raz.
- Solo: jeden przypisany gracz oraz nieruchomy przeciwnik testowy. Można sprawdzić
  rzeczywisty start, rundę i wynik. Ten tryb nie zmienia ELO ani kar.
- Przerwany start wraca do rozgrzewki. Restart procesu lub nieoczekiwana zmiana mapy
  aktywnego meczu wymaga anulowania i wyczyszczenia; nie odtwarzamy stanu rundy z domysłów.

Domyślny prefiks to `[CSCO.GG]` (`mb_log_tag "CSCO.GG"`). Istniejący wpis
w server.cfg ma pierwszeństwo; przykład z paczki nie zastępuje konfiguracji hosta.
Status `restarts_completed: 3` oznacza trzy wykonane restarty GameDLL, a nie trzy
zaplanowane komendy. Rozłączenie całej strony nie wykonuje pełnego resetu wyniku.
Gracz wracający podczas rundy podlega regułom odradzania GameDLL, może więc czekać
na następną rundę. Gotówka wraca do wartości z rozłączenia; legalny reset połowy/OT
ustawia nową kwotę startową. Nie odtwarzamy upuszczonych broni ani zdrowia.

## Pliki i odzyskiwanie

Agent nadal używa `addons/amxmodx/configs/mq2/<id>-<generation>.txt`
i `addons/amxmodx/data/mq2/events.jsonl`. Te ścieżki są kontraktem integracji.
Nowe pliki `active-matchbot.txt` i `generation-matchbot.txt` również muszą być trwałe.
Nie zeruj generacji i nie przenoś aktywnego katalogu między różnymi rejestracjami serwera.

Stary `active.txt` powoduje kwarantannę. Najpierw zakończ przypisanie w CSCO;
komenda cleanup/abort agenta usuwa markery. Samo skasowanie pliku nie zwalnia
rezerwacji po stronie WWW. Dziennik i spool muszą zachować kolejność zdarzeń.

Rollback: zatrzymaj pusty serwer i przywróć kopię silnika/pluginów.
WWW 0.4 nie przydzieli nowych meczów do starego kontrolera AMXX 0.3.
Nie przywracaj starej bazy agenta nad nowsze, niepotwierdzone zdarzenia.

## Budowanie

Pełne źródła znajdują się w `source/`. Na Linux/WSL z Docker:

```
docker build -t csco-matchbot-builder:bookworm -f games/cs16/matchbot/Dockerfile.build .
sh bin/build-matchbot.sh "$PWD"
```

Build QA wymaga jawnego drugiego argumentu `1` i jest wyłącznie do izolowanych testów.
Nie instaluj go na publicznym serwerze. Wydanie zawiera tylko binarkę Linux;
Windows nie był weryfikowany. Użyte API: ReHLDS >=3.14, ReGameDLL >=5.27.

Zmiany i zakres odbioru opisują RELEASE-CS16-0.5.2.md oraz ACCEPTANCE.md.
Natywny napis kolumny Score należy do klienta; `/stats` i `/score` udostępniają K/D/A.
Zachowaj również
original-hostname.txt — po recovery oryginalna nazwa wraca bez omijania kwarantanny.
