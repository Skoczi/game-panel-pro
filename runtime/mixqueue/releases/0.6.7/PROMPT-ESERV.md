# ESERV: MatchBot CSCO 0.6.7 / agent 0.6.3 — test 10 botów

Nowe, wersjonowane wydanie: kontroler **0.6.7**, agent **0.6.3**, WWW **0.8.0**. Nie nadpisuj starszych wydań. Pakiet zawiera poprzednie poprawki audytu 0.6.6.

## Funkcja

W panelu testów WWW pojawia się wariant **Boty 5v5**. Domyślna mapa to `de_dust2`, jeśli jest w zweryfikowanej puli serwera; administrator może wybrać inną dostępną mapę oraz MR12/MR15. Boty używają istniejącego natywnego AI ReGameDLL i nawigacji. Rundy testowe nadal trwają 30 sekund.

Właściciel zarządza testem w WWW, nie zajmuje slotu zawodnika i nie otrzymuje statystyk, ELO ani kar. Start pomija webowy ready check i veto, tworzy dziesięciu botów 5+5 oraz wysyła normalny podpisany load. Pierwsza drużyna zaczyna CT. Test trafia do historii właściciela jako test, nie jako jego wygrana/przegrana.

Po faktycznym załadowaniu mapy i utworzeniu botów kontroler odlicza **15 sekund**, następnie zgłasza ich gotowość. Potem wykonuje dotychczasowe trzy restarty i rozpoczyna LIVE. Limit bezpieczeństwa na ukończenie przygotowania i gotowości pozostaje 300 sekund; 15 sekund nie jest terminem anulowania. Brak pełnego rosteru, błąd reguł lub recovery nadal blokuje start. Zegar nie liczy czasu poprzedzającego changelevel i jest zerowany przy cleanup/recovery.

## Kontrakt i instalacja

- Agent 0.6.3 jest rzeczywistą zmianą: serializuje jawne `rules.test=true`, `rules.test_type=full`, `rules.bot_only=true` jako nagłówek `MQ2V3` z trybem `3`. Wymaga dokładnie dziesięciu botów, dwóch kapitanów i poprawnego SteamID właściciela poza rosterem. Dawny full test pozostaje trybem `2`.
- Zachowano `agent_protocol=2`, `assignment_contract=3`, `stats_version=2`, `ruleset=2` i kontrakt obserwatorów. Capability kontrolera: `bot_only_test=true`, `bot_only_ready_seconds=15`. WWW wymaga także wersji kontrolera >=0.6.7 i agenta >=0.6.3 do tego wariantu. Stare agenty/kontrolery nie mogą rozpocząć nowego trybu.
- Zweryfikuj zewnętrzny SHA-256, manifest i wewnętrzne SHA256SUMS. Zaktualizuj pakiet uniwersalnego instalatora WAW1/WAW2, kontroler oraz runtime agenta. Zasoby AI i nawigacji są zachowane z poprzedniej paczki.
- Wdrożenie kontrolera i restart przez ESERV wyłącznie na pustym SRV-107, bez aktywnego lease, w normalnym idle. CSCO nie wdraża samodzielnie binarki na serwerze gry. Nie włączaj publicznej puli.
- Zachowaj klucze, tożsamości, generacje, spool/WAL, journal, recovery, active-matchbot, original-hostname, original-bots, dane i historię. Nie wyłączaj globalnie AMXX. Zachowaj wcześniejsze wyłączenia konfliktów mq2_match.amxx/statsx.amxx.

## Odbiór na serwerze

1. Sprawdź hash biblioteki, `meta list` i heartbeat: kontroler 0.6.7, agent 0.6.3 oraz obie nowe capabilities. Serwer healthy/idle/rules_ready.
2. Bez żadnego gracza Steam uruchom z WWW Boty 5v5 na de_dust2. Sprawdź właściciela poza rosterem i dziesięć przypisanych botów.
3. Do 15 sekund od loaded boty nie są gotowe i mecz nie zaczyna restartów. Po 15 sekundach potwierdź 10/10 ready, trzy restarty, LIVE, ruch i strzelanie AI oraz kolejne rundy/statystyki. Osobno sprawdź start z innej mapy, aby changelevel nie skrócił odliczania.
4. Sprawdź zakończenie meczu, 180 sekund na wynik i normalne cleanup/idle/zwolnienie lease. Sprawdź również przycisk zakończenia testu w WWW. Właściciel nie dostaje ELO/kar ani osobistych statystyk.
5. Sprawdź, że normalny test 1+9 nadal wymaga /ready człowieka. Nie resetuj historii ani generacji dla testów.

**HLTV nie jest częścią tego wydania.** Obecna kontrola wejścia odrzuca `FL_PROXY`. Automatyczny mecz botów przygotowuje scenariusz do przyszłego odbioru, ale nie umożliwia jeszcze podłączenia HLTV ani nie dodaje nagrywania demek. Nie wyłączaj kontroli rosteru/recovery w celu obejścia tej blokady.

Testy automatyczne oraz build są opisane w ACCEPTANCE.md. Brak nowego odbioru Steam/GameDLL: lokalny runtime gry nie był dostępny. Nie przedstawiaj testów parsera i zegara jako dowodu rozegranego meczu dziesięciu AI.
