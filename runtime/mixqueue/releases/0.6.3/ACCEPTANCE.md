# Odbiór automatyczny MatchBot 0.6.3 / WWW 0.7.3

Kontroler produkcyjny SHA-256: `cbc24d3b18018db4589581327ae8bc3f120c8de6736129024a053e27868dc4da`.
Kontroler QA SHA-256: `258a13394307aa6bd195aeb1ed5c778ac8106203031d407791f90031f32ce8d8`.
Agent pozostaje 0.6.1, SHA-256 `2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a`.
Wymagane WWW minimum 0.7.3. Dowody z hashami: `evidence/release-proof.json`.

## Potwierdzone na końcowej binarce QA

Izolowany ReGameDLL 5.30.0.814 / ReHLDS, kontener network none. Ludzkich
uczestników zastępowały encje QA ze zweryfikowanym przypisaniem; to nie odbiór Steam.

- Ranking 2v2: zegar rundy 120 s, freeze 8 s; ranking 5v5: 105 s, freeze 10 s.
  Full test 5v5 oraz solo 2v2/5v5: 30 s z właściwym freeze. C4 35 s, voice 1,
  pausable 0, startmoney 800 / OT 10000, trzy restarty przed LIVE.
- 26 rzeczywistych eliminacji przez TakeDamage: 8:0, 8:8, 11:8, 11:11,
  14:11, naturalny finał 15:11. MR3 po MR8 ma dokładnie 3+3 rundy.
- Pięć faktycznych 20-sekundowych przerw (połowy i przed OT), zamrożenie,
  PL/EN o zmianie stron/remisie/MR3, tytuł HALFTIME z limitem nagłówka.
  Legacy kontynuacja oraz polecenia pauzy nie skracają przerwy.
- Pauza kapitana w freeze, dwa przeciwne głosy, wznowienie z freeze 8 s,
  zachowany ekwipunek i wynik. Timeout z ostatniej rundy pierwszej połowy
  czeka przez przerwę i LO3, zużywając limit tylko przy rzeczywistym starcie.
  Trzecia pauza w OT; każda daje pojedynczy resume.
- Po naturalnym 15:11 pojedynczy finished, co najmniej 180 s zachowanego
  wyniku i czterech uczestników; stały deadline, brak restartu/new round,
  potem normalny cleanup. Sam upływ zegara nie zwalnia lease.
- round_reason: eliminacje, naturalne 105 s do końca czasu, rzeczywiste
  podłożenie/rozbrojenie oraz naturalny wybuch po 35 s. Końcowa runda ma
  finished z przyczyną; resztę nazw scenariuszy sprawdzono jednostkowo.
- Test -> cleanup -> kolejne profile, usunięcie botów. Zmiana freeze 2v2
  na 10 s i dodanie domyślnego AK47 powodują recovery bez load/resetu wyniku
  lub generacji; normalny cleanup przywraca zdrowy idle.

## Potwierdzone na końcowej binarce produkcyjnej

- Brak QA RCON. Podpisane ranked 2v2 warmup: roundtime 2, freeze 0, buytime 2,
  voice 1, pausable 0, bot_quota 0; zwykły abort/cleanup i zachowany high-water.
- Osobne storage_failure / malformed_assignment / missing_map, brak fałszywego
  loaded, inwentaryzacja BSP. Retry load emituje loaded raz.
- Full test warmup z dziewięcioma natywnymi botami, ręczny finish_test daje
  pojedynczy test_ended ze statystykami dziesięciu uczestników; cleanup usuwa
  boty, przywraca hostname i ustawienia, ponowiony load starej generacji odpada.
- Rzeczywisty restart izolowanego procesu z aktywnym przypisaniem: recovery,
  odmowa ponownego load, zachowany marker/generacja, kontrolowany cleanup/idle.

## Backend i WWW

Siedem zestawów C++ z ASan/UBSan: contract, feedback, safety, statistics,
bots, break, end. Dziesięć zestawów PHP na SQLite i izolowanej MariaDB 063:
post_match_grace, round_timeline, system_test, run, server_tests, test_matches,
test_match_failures, disconnects, statistics, game_readiness. Wszystkie PASS.

Cleanup niedostępny w 179 s, dostępny w 180 s; odtworzenie Engine, duplikaty
i retry nie przesuwają terminu. Wynik/statystyki/ELO zapisane od razu,
rezerwacja serwera do podpisanego idle. Poddanie, full test i solo sprawdzone
w backendzie. Testy bez ELO/kar. Ręczny stop, błąd, abort i wyścig stop->finished
bez dodatkowych 180 s. CSGO/CSCO zachowują dotychczasowe cleanup.

Oś rund: prawdziwe przyczyny, logiczne drużyny, końcowa runda, kolejność,
izolacja generacji/duplikatów/zdarzeń po zakończeniu, luki i stare dane,
odrzucenie błędnej przyczyny przed zmianą wyniku. Publiczna projekcja nie
ujawnia surowego journalu. Widz spoza składu widzi K/D/A, ADR i HS%, ale
nie otrzymuje prywatnego adresu connect. Testy pozostają objęte istniejącymi
uprawnieniami. Statystyki są aktualizowane po zatwierdzonej rundzie.

Przeglądarka: PL/EN, desktop i 390 px, wybór rundy, podział MR8/MR15+OT,
brak paska etapów po zakończeniu; LIVE aktualizuje wynik i statystyki bez
przeładowania strony. To dane demonstracyjne, nie dowód gry Steam.
WWW dodaje indeks odczytu zdarzeń; nie przepisuje historii.

## Pozostaje do odbioru przez ESERV / użytkownika

Nie wykonano Steam 0.6.3, 2+8 z dwoma ludzkimi kapitanami ani dziesięciu
prawdziwych klientów. Nie deklarujemy nowego odbioru reconnect Steam, głosu,
każdej mapy/NAV, całej rozgrywki produkcyjnej z klientami, MR15 halftime/OT
z prawdziwymi graczami ani naturalnego zakończenia full/solo z klientem Steam.
MR15 granice sprawdzono jednostkowo; runtime pełnej sekwencji użył MR8.
AI ruch/walka z 0.6.2 nie są tu ponownie deklarowane jako odbiór Steam 0.6.3.
Wcześniejsza przyczyna crasha klienta pozostaje nieustalona.

CSCO nie wdrażało binarki na aktywnym SRV-107 i nie włączało publicznej puli.
ESERV wykonuje restart tylko pustego serwera bez lease. Starsze wydania,
tożsamości, klucze, journal, spool, generacje i historia pozostają zachowane.
