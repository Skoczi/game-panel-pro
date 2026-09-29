# ESERV — MatchBot 0.6.3, profile, przerwy i wynik meczu

Wdróż nową paczkę `mixqueue2-eserv-0.6.3.zip` po sprawdzeniu manifestu
i SHA256SUMS. Nie nadpisuj starszych wydań. Zmiany mają trafić do uniwersalnego
instalatora WAW1/WAW2; kontrolowany odbiór gry wykonaj na pustym SRV-107,
po zakończeniu cleanup i zwolnieniu lease. Nie przerywaj meczu ani recovery.

Wersje: **kontroler 0.6.3, agent 0.6.1 bez zmian, WWW minimum 0.7.3**.
WWW 0.7.3 musi działać przed odbiorem kontrolera: obsługuje retencję po meczu
i oś rund. Protocol 2, adapter amxx, assignment_contract 3 i stats_version 2
pozostają; round/finished dodają opcjonalny round_reason. Nie ma nowej
komendy RCON ani zmiany API agenta. Publiczna pula pozostaje wyłączona.

Agent `mq_agent.py` ma SHA-256
`2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a`.
Dołączony oryginalny `mixqueue2-agent-0.6.1.zip` ma SHA-256
`f8d80c3e7deb4fe2608ac7e536d226f8bc8caa0f88728472659949c6272c432f`.
Jeśli ta wersja i hash już pracują, zachowaj runtime agenta; nie przebudowuj
go tylko w celu zmiany numeru wydania kontrolera. Starszy runtime uaktualnij
do tego istniejącego 0.6.1 z zachowaniem konfiguracji i spoola.

Oczekiwane profile:

- 5v5: aktywna runda 105 s, freeze 10 s.
- 2v2: aktywna runda 120 s, freeze 8 s.
- full_test / solo: aktywna runda 30 s, freeze według trybu.
- `sv_voiceenable 1`, `pausable 0`; pauzy wyłącznie istniejącymi ścieżkami
  kontrolera. Klasyczna rozgrywka ReGameDLL bez dodatkowego respawnu,
  deathmatch lub nieskończonych rund w LIVE.

C4 35 s, `/ready` 300 s, kapitańskie pauzy 3 x 30 s i systemowa pauza
1 x 90 s na drużynę zachowują dotychczasowe zasady. Bomba może przedłużyć
rundę. W testach nadal nie ma ELO ani kar, bot-kapitan nie głosuje `/unpause`.
Nie dopisuj własnych poleceń RCON do API agenta.

Przerwa między połowami oraz przed rozpoczęciem dogrywki ma 20 sekund.
Sprawdź jej licznik i automatyczne przejście do dalszej gry oraz komunikaty
PL/EN o remisie i dogrywce MR3. Dotyczy to także remisu w 2v2: próg końca
regulaminowej gry wynika z MR8, a nie ze stałej wartości dla 5v5.

Po naturalnym wyniku oraz poddaniu sprawdź 180 sekund na screeny i gg,
z komunikatem i licznikiem PL/EN. Runda, wynik i statystyki nie mogą się
resetować. WWW finalizuje wynik od razu, ale polecenie cleanup udostępnia
dopiero po upływie 180 sekund od przyjęcia wyniku; dochodzi zwykły czas
pollingu. Lease zwalnia wyłącznie potwierdzone idle. Nie skracaj tego
okna lokalnym cleanup ani nie resetuj historii lub generacji. Naturalne
full_test i solo mają to samo okno; ręczny End test, abort, limit testu
i server_error kończą operacyjnie bez oczekiwania 180 sekund.

Sprawdź oś rund na WWW: logiczny zwycięzca, wynik po rundzie oraz powód
eliminacja / bomba wybuchła / rozbrojenie / czas / inny. Powód jest odczytem
GameDLL, nie wnioskiem ze statystyk. Stare wpisy bez round_reason mają
nieznany powód, a brakujących rund nie wolno uzupełniać zgadywaniem.
Pod linkiem meczu w LIVE / PAUSED WWW pokazuje też K/D/A, ADR i HS% po
zakończonych rundach. Sprawdź automatyczne odświeżenie po kolejnym round,
bez ujawniania bieżących obrażeń. Pasek etapów znika po zakończeniu meczu.

Źródłem bazowych wartości jest przekazany zestaw ESL zaakceptowany przez
użytkownika; różnice 5v5 / 2v2 i wyjątki opisuje RULES.pl.md. Nie deklarujemy
zgodności z dowolnym aktualnym regulaminem ligi. Kontroler pilnuje wartości
bez wykonywania starego `esl.cfg` i bez jego nadpisywania. `mp_decals`
i `sv_airmove` pominięto, ponieważ nie występują w przypiętym silniku.
Poprawny wpis to `mp_consistency`, bez zamiany na `sv_consistency`.

Scal jednorazowe `log on` z konfiguracją startową hosta na podstawie
HOST-STARTUP.example.cfg; zachowaj istniejący wpis, jeśli już działa.
Nie wysyłaj tej komendy cyklicznie z agenta/kontrolera ani przy każdej fazie,
ponieważ otwiera kolejny plik logu. Nie zastępuj tym przykładem całego server.cfg.

Zachowaj działające zasoby AI z 0.6.2. Paczka ponownie zawiera ten sam
oficjalny ZIP profili ReGameDLL 5.30.0.814 i NAV Dust2 wraz z hashem BSP;
ich ponowna obecność w ZIP nie oznacza konieczności nadpisania plików hosta.
Weryfikację istniejących plików, brakujących map i scalanie konfiguracji
opisuje INSTALL.pl.md. NAV przygotuj offline, przed lease. Nie zastępuj
ręcznie edytowanej nawigacji bez weryfikacji i backupu.

Po restarcie sprawdź faktycznie załadowaną bibliotekę, jej hash i heartbeat.
Odbiór zacznij od Dust2 1+9: boty poruszają się, kupują broń i walczą;
gotowość prowadzi przez trzy restarty do LIVE, a aktywna runda zaczyna od
0:30. Zweryfikuj wynik, statystyki, koniec testu i normalny idle/release.
Osobno sprawdź profile 5v5 1:45 / freeze 10 oraz 2v2 2:00 / freeze 8,
w tym przejście test → cleanup → nowy tryb i zachowanie po zamianie stron.
Nie uznawaj odczytu cvar za zastępstwo sprawdzenia zegara i działania gry.
W 5v5 i 2v2 sprawdź przejście połów, remis regulaminowy i wejście do MR3:
20 s przerwy, poprawny komunikat i zachowany wynik. Odbiór tych nowych
przejść wykonaj na finalnej binarce 0.6.3, nie na wcześniejszym buildzie profili.
Naturalne zakończenie i ręczny End test odbierz osobno: tylko pierwsze
zachowuje klientów przez trzy minuty. Po upływie tego czasu sprawdź normalne
cleanup/idle/release i zachowanie końcowej tabeli oraz osi rund na stronie.

Odbiór 2+8 wymaga dwóch ludzkich kapitanów: pauza podczas freezetime,
rezerwacja w aktywnej rundzie, naturalne wygaśnięcie, dwa przeciwne głosy
`/unpause`, brak zmiany wyniku, ekwipunku i statystyk. Sprawdź rozmowę głosową
i brak możliwości omijania kontrolera zwykłym silnikowym `pause`.
Testy rzeczywistych klientów Steam dokumentuj oddzielnie od testów GameDLL.

Dokładny zakres faktycznie wykonanej weryfikacji jest w ACCEPTANCE.md
i zahashowanych plikach evidence/. Wyniki wcześniejszych wydań nie są
automatycznie odbiorem 0.6.3. Nie włączaj publicznych kolejek.

Zachowaj konfigurację, klucze, server_id, broker isolation, RCON, spool/WAL,
journal, generację, active-matchbot, original-hostname, original-bots.txt,
recovery, historię i pozostałe AMXX. Konflikty pozostają ograniczone do
mq2_match.amxx i dokładnie statsx.amxx. Nie resetuj danych na potrzeby testu.
