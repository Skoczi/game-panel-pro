# CSCO 0.6.3 — audyt CVAR-ów ESL i profilu ReGameDLL

## Zakres i metoda

Audyt źródeł oraz implementacji profilu, bez zmian serwera gry. Porównano listę użytkownika ESL 2009 5v5 i różnice ESL 2005 2v2 z przypiętymi źródłami **ReHLDS 3.15.0.896** oraz **ReGameDLL_CS 5.30.0.814**. Przeszukano wszystkie pliki C++/nagłówki obu archiwów źródłowych; dla istotnych wyjątków sprawdzono również rejestrację CVAR-ów i ich użycie, a nie samą deklarację. Przejrzano `MatchCSCOSafety.h`, `MatchCSCO.cpp`, `MatchPause.cpp`, kontrakt przypisania i testy polityki.

Wynik: **56 z 58 nazw CVAR-ów przekazanych przez użytkownika ma deklaracje w tych źródłach**. Dwa brakujące wpisy to `mp_decals` i `sv_airmove`. Polecenie `log on` nie jest CVAR-em i nie wchodzi do tej liczby. Nie jest to deklaracja odbioru wszystkich ustawień na rzeczywistym kliencie Steam; testy wykonania wydania opisuje osobny raport odbioru.

## Wyjątki i decyzje

| Ustawienie | Ustalenie i decyzja |
| --- | --- |
| `mp_decals 300`, `sv_airmove 1` | Brak tych nazw w przypiętych źródłach serwera ReHLDS i ReGameDLL. Pominięte w aktywnej polityce; nie mogą być warunkiem `RulesReady`. Nie wymuszać zastępczych ustawień klienta. |
| `mp_consistency 1` | Prawidłowa nazwa silnika. Deklaracja w `rehlds/engine/sv_user.cpp`, rejestracja w `SV_Init` w `sv_main.cpp`, wykorzystanie przy sprawdzaniu spójności zasobów. Nie zastępować przez `sv_consistency`, którego w tych źródłach nie ma. |
| `mp_falldamage 1` | Dostępny i rejestrowany w ReGameDLL z `REGAMEDLL_ADD`; właściwy jako wymagany warunek klasycznych obrażeń od upadku na obsługiwanym runtime. |
| `mp_mirrordamage 0` | Sama deklaracja istnieje, ale rejestracja jest pod `#ifndef REGAMEDLL_FIXES`. W profilu ma być **optional**. Nie wyłączać poprawek GameDLL, aby odzyskać historyczny, nieaktywny CVAR. |
| `mp_scoreboard_showhealth -1`, `mp_scoreboard_showmoney -1`, `mp_scoreboard_showdefkit 0` | Rejestracja jest zależna od `BUILD_LATEST`, dlatego wszystkie trzy ustawienia są **optional**. Oficjalny `dist/game.cfg` dokumentuje `-1` jako wyłączenie pola HP/Money, a `0` jako wyłączenie informacji o defuse kit. Nie zmienia to lokalizacji standardowej kolumny Score ani konfiguracji TAB klienta. |
| `ff_damage_reduction_other 0.35` | Klasyczna ścieżka `CBasePlayer::TakeDamage` bez `REGAMEDLL_ADD` mnoży odpowiednie obrażenia przyjacielskie przez `0.35`; oficjalny `dist/game.cfg` także podaje `0.35`. Deklaracja rozszerzonego CVAR-u w `game.cpp` ma `0.25`, więc sam skompilowany domyślny CVAR nie jest wystarczającą podstawą dla profilu klasycznego. Przyjęto jawnie `0.35`. |
| `sv_wateramp 0` | Istnieje, jest rejestrowany i przekazywany przez `movevars.waveHeight`. Nie należy usuwać go tylko z powodu nietypowej historycznej nazwy. |
| `host_framerate 0` | Istnieje i wpływa na sposób obliczania czasu klatki. Wartość `0` jest wymagana przez profil. Nie zmieniano przy tej okazji innych poprawek silnika, recoil ani konfiguracji odzyskiwania sesji. |
| `mp_logdetail`, `mp_logecho`, `mp_logfile`, `mp_logmessages` | Wszystkie przekazane nazwy są poprawne. `mp_logdetail`/`mp_logmessages` należą do GameDLL, a `mp_logecho`/`mp_logfile` do silnika. |
| `log on` | To polecenie silnika, nie CVAR. Wywołuje `Log_Open`; pozostaje w konfiguracji startowej hosta ESERV, a nie w `Profile` uruchamianym przy każdej zmianie fazy. Samo `mp_logfile 1` nie jest dowodem, że wykonywano `log on`. |
| `allow_spectators 0` | Blokuje wybór drużyny SPECTATOR w GameDLL; nie jest zamiennikiem ograniczeń kamery martwego zawodnika. Kod GameDLL przewiduje wyjątek dla proxy, ale nie omija on kontroli dostępu CSCO. |
| `sv_timeout 65` | Jest timeoutem połączenia silnika. Może opóźnić wykrycie utraty połączenia po crashu klienta. **Nie jest timerem kary, banem ani długością systemowej pauzy.** Pauza 90 sekund i dalsze reguły nieobecności zaczynają działać zgodnie ze zdarzeniem rozłączenia i stanem kontrolera. |
| `sv_proxies 1` | Ustawia limit proxy silnika; nie nadaje im uprawnienia do wejścia do meczu CSCO. Kontrola składu nadal odrzuca nieautoryzowany `FL_PROXY`, zatem wydanie nie może deklarować wdrożonej obsługi HLTV. |

## Przegląd implementacji profilu

- Tryb 2v2 lub 5v5 pochodzi z walidowanego, podpisanego `config.size`, a nie z liczby aktualnie połączonych graczy. Ta sama wartość trafia do nakładania profilu i kontroli `RulesIssue`.
- 5v5 otrzymuje rundę 1:45 i freeze 10 sekund; 2v2 rundę 2:00 i freeze 8 sekund. Aktywna runda testowa zachowuje osobny limit **30 sekund**.
- Zachowano wyjątki rozgrzewki, startowe 800 $, 10 000 $ w dogrywce, limit 16 000 $, zakup 15 sekund i dotychczasowe zabezpieczenia przed respawnem lub nieskończoną rundą w LIVE.
- Pauzy nadal korzystają z jednego toru wznowienia. `Resume` odczytuje aktualny CVAR freezetime, więc przywraca odpowiednio 8 lub 10 sekund, oraz przywraca zapamiętany buytime. Nie dodano restartu rundy ani resetu wyniku przy wznowieniu.
- Po cleanup konfiguracja przypisania jest czyszczona i obowiązuje domyślny profil idle 5v5. Nie pozostaje aktywny 30-sekundowy profil testu ani tryb 2v2 poprzedniego przypisania.
- Statyczne tekstowe ustawienia wyposażenia są rejestrowane przez `REGAMEDLL_ADD`: CT `usp`, T `glock18`, brak dodatkowej broni podstawowej, granatów i losowego wyposażenia; nóż pozostaje włączony.
- Uzgodnione wyjątki względem historycznych konfiguracji to **`sv_voiceenable 1`** i **`pausable 0`**. Pauzami steruje kontroler, a nie ogólna komenda pauzy silnika.
- Wymagane rozszerzenia utrzymują klasyczne zasady: brak automatycznego bunnyhopu/przekraczania limitu prędkości, losowego spawnu, odporności po spawnie, dowolnego miejsca podkładania C4, darmowego wyposażenia i niestandardowej ekonomii. Nie wyłączono arbitralnie poprawek recoil ani zabezpieczeń recovery.

Po oznaczeniu `mp_mirrordamage` jako optional i ustaleniu klasycznego mnożnika `ff_damage_reduction_other 0.35` przegląd źródeł nie wykazał kolejnego blokującego błędu w przekazywaniu trybu, profilach faz, cleanup lub wznowieniu pauzy. Dostępność i zachowanie binarki wymagają osobnej weryfikacji wykonania; ten dokument nie zastępuje odbioru Steam.

## Źródła przypięte

- [ReHLDS 3.15.0.896 — sv_user.cpp](https://github.com/rehlds/ReHLDS/blob/3.15.0.896/rehlds/engine/sv_user.cpp): `mp_consistency`, `sv_voiceenable`, ustawienia ruchu i sprawdzanie zasobów.
- [ReHLDS 3.15.0.896 — sv_main.cpp](https://github.com/rehlds/ReHLDS/blob/3.15.0.896/rehlds/engine/sv_main.cpp): rejestracja CVAR-ów, `sv_wateramp`, timeout, limity rate/update i proxy.
- [ReHLDS 3.15.0.896 — host.cpp](https://github.com/rehlds/ReHLDS/blob/3.15.0.896/rehlds/engine/host.cpp): `host_framerate`, `pausable`, rejestracja ustawień logowania i czas klatki.
- [ReHLDS 3.15.0.896 — sv_log.cpp](https://github.com/rehlds/ReHLDS/blob/3.15.0.896/rehlds/engine/sv_log.cpp): `mp_logecho`, `mp_logfile`, `SV_ServerLog_f` i `Log_Open`.
- [ReGameDLL_CS 5.30.0.814 — game.cpp](https://github.com/rehlds/ReGameDLL_CS/blob/5.30.0.814/regamedll/dlls/game.cpp): deklaracje i warunki rejestracji, w tym `REGAMEDLL_ADD`, `REGAMEDLL_FIXES` oraz `BUILD_LATEST`.
- [ReGameDLL_CS 5.30.0.814 — client.cpp](https://github.com/rehlds/ReGameDLL_CS/blob/5.30.0.814/regamedll/dlls/client.cpp): obsługa `allow_spectators` przy wyborze drużyny, w tym wyjątek proxy.
- [ReGameDLL_CS 5.30.0.814 — player.cpp](https://github.com/rehlds/ReGameDLL_CS/blob/5.30.0.814/regamedll/dlls/player.cpp): `CBasePlayer::TakeDamage`, klasyczna gałąź mnożnika FF `0.35` i wariant rozszerzony.
- [ReGameDLL_CS 5.30.0.814 — dist/game.cfg](https://github.com/rehlds/ReGameDLL_CS/blob/5.30.0.814/dist/game.cfg): opis rozszerzeń, opcjonalnych pól TAB, bunnyhopu, obrażeń i wyposażenia.

W trakcie tego audytu nie zmieniano kodu kontrolera, konfiguracji hosta, binarki gry, aktywnego meczu, historii ani stanu recovery. Utworzono wyłącznie ten raport.
