# Instalacja 0.6.3 w ESERV

1. Potwierdź WWW >=0.7.3 oraz agent 0.6.1. WWW obsługuje retencję wyniku
   przez 180 s i opcjonalne round_reason, potrzebne do osi rund.
   Sprawdź manifest i SHA-256 oraz wykonaj backup zmienianych plików.
2. Zaczekaj na pusty serwer, zakończenie cleanup, brak lease i brak trwającego
   recovery. Zainstaluj kontroler 0.6.3 i jego language.txt. Nie używaj binarki
   QA. Starsze paczki wydania zachowaj pod niezmienionymi nazwami i hashami.
3. Agent pozostaje 0.6.1: `mq_agent.py` SHA-256
   `2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a`.
   Zachowaj zgodny runtime; jeśli jest starszy, użyj oryginalnej paczki
   agent-0.6.1 ze zbioru packages/. Nie nadawaj agentowi wersji 0.6.3.
4. Zasoby AI i ReGameDLL 5.30.0.814 pozostają jak w 0.6.2. Wymagane jest
   `bot_enable "1"` w cstrike/game_init.cfg. Scal pojedyncze ustawienie,
   zachowując inne wpisy; jego zmiana wymaga pełnego kontrolowanego restartu.
   Nie nadpisuj całego game_init.cfg, server.cfg ani lokalnych konfiguracji.
5. `resources/bot_profiles-5.30.0.814.zip` to oryginalny ZIP oficjalnego repo.
   Weryfikuj istniejące zasoby przed instalacją. Rozpakowując jego cstrike/,
   zachowaj strukturę BotProfile.db, BotChatter.db i sound/radio/bot/, nagłówki
   autorów, pochodzenie i backup zmienianych plików. Sam ZIP kontrolera
   wskazuje ten sam URL i SHA-256 w dependencies.json.
6. Każda mapa testów AI wymaga zgodnego maps/<map>.nav. Przygotuj nawigację
   na odizolowanej kopii bez przypisania i aktywnego MatchBot; odnotuj oba
   hashe BSP/NAV i sprawdź ruch oraz cele. Nie analizuj mapy podczas lease
   ani nie nadpisuj istniejącego ręcznie edytowanego NAV bez weryfikacji.
7. Dołączony `navigation/de_dust2.nav` pochodzi z wydania 0.6.2 i pasuje do
   BSP SHA-256
   `15945389528d113562ede0a2c80647ebfa799079ed1c05a25379bcf84e4e9286`.
   NAV SHA-256:
   `9a44381363572f05d42fa4f82b293f54e49c93d60a4471d2fe8396ecceb77753`.
   Sprawdź navigation/nav-proof.json. Sama nazwa mapy nie potwierdza zgodności.
8. Uruchom
   `python3 scripts/check-cs16-bot-navigation.py --root /sciezka/cstrike de_dust2`
   z pełną listą map testowych zamiast samego de_dust2. Narzędzie wykonuje
   tylko odczyt nagłówków i SHA-256; poprawny wynik nie zastępuje kontrolera
   ani odbioru gry. W source.zip skrypt leży w bin/.
9. Wykonaj kontrolowany restart. Sprawdź hash załadowanej biblioteki,
   świeży heartbeat i profile 5v5 105/10 s, 2v2 120/8 s oraz testy 30 s.
   Zweryfikuj `sv_voiceenable 1`, `pausable 0`, zwykły przebieg rund i pauzy
   kontrolera według PROMPT-ESERV.md. Pełny zakres odbioru opisuje ACCEPTANCE.md.

Nowa binarka obejmuje również 20 s przerwy między połowami i przed
dogrywką, z komunikatami PL/EN o remisie oraz MR3. Zachowaj language.txt
z tego samego wydania co biblioteka i zweryfikuj oba języki w odbiorze.
Po naturalnym końcu meczu i poddaniu gracze pozostają przez 180 s na
serwerze. Dopiero polecenie cleanup z WWW i potwierdzone idle zwalniają
lease. Ręczne zakończenie testu i abort/błąd zachowują natychmiastowy cleanup.
Nie zastępuj tego własnym timerem ESERV ani bezwarunkowym restartem gry.

Konfigurację `log on` scal przed restartem jako pojedynczy wpis startowy
hosta, korzystając z HOST-STARTUP.example.cfg. Jeśli istniejące uruchomienie
już włącza logowanie, zachowaj je bez duplikacji. Ta komenda otwiera plik
logu przy każdym wywołaniu, więc nie należy jej powtarzać w pętli kontroli
cvar ani na granicach rund/faz. Nie nadpisuj starego, ręcznie utrzymywanego
esl.cfg. Szczegóły wartości, ich pochodzenie i pominięte cvar są w RULES.pl.md.

Źródła kontrolera, dołączone SDK, licencje, Makefile i Dockerfile.build są
w source.zip. Na Linux/WSL można przygotować obraz i zbudować źródła:

```sh
docker build -t csco-matchbot-builder:bookworm -f games/cs16/matchbot/Dockerfile.build .
sh bin/build-matchbot.sh "$PWD" 0
```

Budowa jest lokalną kontrolą źródeł, a hash zatwierdzonego artefaktu wydania
pochodzi z manifestu. Nie instaluj ponownie zbudowanej biblioteki jako rzekomo
tego samego pliku bez osobnego sprawdzenia hasha i odbioru.

Zachowaj klucze, identyfikatory, spool/WAL, journal, generację, active-matchbot,
original-hostname, original-bots.txt, recovery i historię. Po cleanup quota
i bot_deathmatch wracają do zera; pozostałe nadpisane ustawienia AI wracają
do zapisanego stanu. Konflikty AMXX pozostają mq2_match.amxx i statsx.amxx.
Przykładowe cfg nie zastępują konfiguracji hosta. Publiczna pula jest wyłączona.
