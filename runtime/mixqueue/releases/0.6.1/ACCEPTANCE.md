# Odbiór 0.6.1 / WWW 0.7.1 — 29.09.2026

## Automatycznie sprawdzone

- 17 zestawów PHP na SQLite i osobnej bazie MariaDB mq2_test_audit_061.
  Nowe przypadki: gotowość 300 s, 15 s margines transportu, niezmienność
  podpisanego config_hash, ostatni /ready tuż przed terminem, osobny guard LO3,
  disconnect bez przedłużania terminu, brak reaktywacji po anulowaniu,
  testy bez ELO/kar, brak przedwczesnego zwolnienia lease, cleanup/idle.
- Auto-requeue: 9 zaakceptowanych wraca bez nowego join; kolejny gracz tworzy
  mecz. Zachowany joined_at. Gotowa część party zostaje razem, niegotowy lider
  traci sterowanie party. Ponowiony worker nie duplikuje ticketów ani kar.
- Kary gotowości: 30/60/120/1440 min, limit 24 h, wspólny licznik trzech
  przyczyn, granica 7 dni, zachowana historia, osobne kary za porzucenie.
- 33 testy Python agenta; cztery zestawy C++ pod ASan/UBSan; locales/check
  i test polityki dźwięku ready-check.
- Replay prawdziwych journal labu przez WWW, na SQLite i MariaDB:
  tactical 39, disconnect 37, ready-test 23, ready-ranked 13 zdarzeń.
  Przepięto jedynie identyfikatory przypisania, mapę/hash i czas. Sprawdzono
  kolejność, odrzucenie każdego duplikatu, pause/resume, karę tylko ranked,
  brak ELO dla nieukończonych meczów i zwolnienie po idle.

## Izolowany GameDLL

Osobny `/opt/csco-lab/matchbot-061`, Docker `mq2-matchbot-061-qa`, network=none.
Nie jest to SRV-107. Zachowano journal/generację; cleanup normalnymi komendami.

1. Trzy rzeczywiste restarty, pierwszy live freezetime, natychmiastowa pauza.
   Naturalne 30 s i kolejne pauzy 2/3 w freezetime; czwarta odrzucona.
   Zwykły zawodnik/stare menu nie omijają kapitana. Obie kolejności zgód,
   duplikaty, reconnect kapitana, wygaśnięcie równocześnie z głosem.
   Wynik, ekwipunek i pozycja pozostają. Live request czeka do końca rundy,
   nie zużywa limitu przed startem; przeciwna drużyna ma osobny limit.
2. Rzeczywisty timer 90 s, jeden budżet na drużynę. Kapitanowie nie odblokowują
   pauzy systemowej. Oczekująca taktyczna rusza po niej i dopiero wtedy zużywa
   limit. Drugie rozłączenie tej samej drużyny -> grace; przeciwna ma własne
   90 s. Recovery blokuje timer/głosy. Wynik zachowany.
3. Ranked i full_test: loaded zapisuje dokładny termin +300 s; jeden obecny
   człowiek nie daje ready. Po przesunięciu zegara QA pojawia się jeden
   not_ready; późny /ready odrzucony, brak LIVE, normalny cleanup/idle.
   Nie twierdzimy, że odczekano 300 s na prawdziwym kliencie.
4. Osobno finalna binarka produkcyjna 0.6.1 bez mq2_qa: odróżnia brak pliku,
   wadliwe przypisanie i brak mapy; odrzucenia nie emitują loaded. Inventory
   czyta BSP. Retry load nie duplikuje loaded. Dziewięć botów w warmup,
   test_ended zachowuje snapshot, cleanup odtwarza hostname, stara generacja
   odrzucona. Rzeczywisty restart procesu daje recovery/kwarantannę, a normalny
   cleanup przywraca idle bez resetowania high-water mark.

Dowody `feedback-061-*.json` dotyczą encji QA. Tactical/disconnect zbudowano
przed zmianą żądanego czasu ready z 180 na 300 s; te scenariusze dotyczyły
pauz po starcie. Ready i produkcyjne load/recovery powtórzono na finalnych 300 s.

## WWW / przeglądarka

Sprawdzone PL/EN, desktop i mobile: licznik /ready, modal bez Decline,
automatyczny powrót do szukania, link meczu, ranking i historia, filtr testów,
odświeżanie, Wstecz/Dalej i kopiowanie linku. Dane do modalu i licznika są
lokalnymi fixture, nie udawanym odbiorem gry Steam. Screenshoty dostarczone
w katalogu projektu. Audyt wdrożenia zapisuje stan przed/po i ścieżkę backupu.

## Do odbioru ESERV / użytkownika

- Kontrolowany restart pustego SRV-107 bez lease; potwierdzenie hashów.
- Steam 2+8 z ludzkimi kapitanami: /pause podczas rundy i freezetime,
  trzy kolejne pauzy, oba /unpause, PL/EN, nazwy i TAB PAUSED -> LIVE.
- Pełne pięć minut, ostatni /ready, brak ready/no-show, WWW i HUD, anulowanie,
  cleanup/idle, test bez ELO/kar. Każdego kolejnego scenariusza nie uznawać
  za zaliczony na podstawie pojedynczego screenshotu.
- Systemowa pauza disconnect ma osobny odbiór ranked w zamkniętym środowisku;
  legacy full_test omija tę ścieżkę i kary. Publicznej puli nie włączać.
- Reconnect Steam, 10 prawdziwych klientów, wszystkie mapy, restarty/awarie
  w wielu fazach pozostają osobnymi testami; wcześniejszy crash niewyjaśniony.
