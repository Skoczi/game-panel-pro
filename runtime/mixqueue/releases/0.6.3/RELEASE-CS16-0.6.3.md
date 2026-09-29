# CSCO MatchBot 0.6.3 — profile, przerwy i zakończenie meczu

Kontroler 0.6.3 rozdziela ustawienia rund dla 5v5 i 2v2 oraz utrzymuje krótki
profil testów. Wymagane WWW 0.7.3 obsługuje 180 sekund po meczu i oś rund
z powodami zakończenia. Agent pozostaje dokładnie w wersji 0.6.1.
Nie utworzono nowej wersji ani nowego archiwum agenta.

| Tryb | Aktywna runda | Freeze time |
| --- | --- | --- |
| Ranking 5v5 | 105 s (1:45) | 10 s |
| Ranking 2v2 | 120 s (2:00) | 8 s |
| Test full_test / solo | 30 s | Według trybu |

Podłożona bomba zachowuje własny licznik 35 s i może przedłużyć rundę testową.
Limit gotowości `/ready` pozostaje 300 s. `sv_voiceenable 1` zachowuje głos,
a `pausable 0` pozostawia pauzy pod kontrolą meczu. Pauzy kapitańskie 3 x 30 s
na drużynę oraz jednorazowa systemowa pauza 90 s zachowują istniejące zasady.
Klasyczne zabezpieczenia ReGameDLL mają wykluczać tryby respawn, deathmatch
i nieskończonych rund podczas właściwego meczu. Szczegółowy zakres finalnej
weryfikacji opisuje ACCEPTANCE.md.

Przerwa między połowami i przed rozpoczęciem dogrywki trwa 20 sekund.
Komunikaty PL/EN informują o remisie i dogrywce MR3. To część przebiegu
meczu; nie zmienia docelowego czasu aktywnej rundy danego trybu.

Po naturalnym zakończeniu meczu lub poddaniu gracze mają 180 sekund na
screeny i gg. Dotyczy to CS 1.6, także naturalnie zakończonych testów full/solo.
Wynik, statystyki i ranking są finalizowane od razu; serwer zachowuje lease
do cleanup i potwierdzonego idle. Kontroler nie resetuje rundy ani sam nie
zwalnia sesji po końcu licznika. Ręczne zakończenie testu, abort, limit czasu
testu oraz błędy serwera zachowują natychmiastową ścieżkę zakończenia.

WWW pokazuje oś rund z logiczną drużyną zwycięzcy oraz powodem: eliminacja,
wybuch bomby, rozbrojenie, koniec czasu albo inny. Powód pochodzi z
zaakceptowanego zdarzenia GameDLL. Starsze wpisy bez tego pola i luki
w historii pozostają oznaczone jako nieznane; system nie zgaduje przebiegu.
Pod linkiem trwającego meczu jest prosta tabela K/D/A, ADR i HS%, odświeżana
automatycznie po każdej zatwierdzonej rundzie. Nie ujawnia obrażeń w trakcie
aktywnej rundy. Po zakończeniu znika pasek Ready / Map / Server / Match / Result.

Bazowe wartości pochodzą z przekazanego przez użytkownika zestawu ESL;
zatwierdzone wyjątki i zabezpieczenia ReGameDLL opisuje RULES.pl.md.
Nie jest to deklaracja zgodności z aktualnym regulaminem ESL. `log on`
pozostaje jednorazowym ustawieniem startowym hosta, a nie poleceniem
powtarzanym przy każdej kontroli zasad. Stary esl.cfg pozostaje bez zmian.

Boty AI z wydania 0.6.2 pozostają dostępne w testach. Pełny test zachowuje
podpisany skład i statystyki, solo ma jednego przeciwnika. Testy nie zmieniają
ELO ani kar. Bot-kapitan nie zastępuje drugiego ludzkiego głosu `/unpause`.
Profile i NAV trzeba przygotować przed przydziałem, bez aktywnego lease.

Protocol 2, adapter amxx, assignment_contract 3, statystyki v2 i dozwolone
kody odrzucenia pozostają bez zmian. Zdarzenia round/finished otrzymują
opcjonalne pole round_reason; agent 0.6.1 przekazuje je bez zmian API.
Opóźnienie cleanup korzysta z istniejącego trwałego available_at. Migracja WWW
dodaje jedynie indeks mq2_event_match do odczytu osi rund; nie przepisuje
historii ani wyników. Wydania 0.6.2 i starsze pozostają niezmienione.

Dokumentacja starego archiwum agenta opisuje jego własne wydanie. Aktualne
instrukcje instalacji kontrolera i zasobów to INSTALL.pl.md i PROMPT-ESERV.md
w głównym katalogu paczki 0.6.3. ESERV przeprowadza kontrolowany restart
pustego serwera bez aktywnego lease oraz osobny odbiór Steam.
