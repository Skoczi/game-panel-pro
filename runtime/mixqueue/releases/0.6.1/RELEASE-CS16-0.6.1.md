# CS 1.6 — kontroler 0.6.1, agent 0.6.0, WWW 0.7.1

Wydanie zastępuje limity pauz i gotowości oraz poprawia nawigację WWW.
Poprzednie paczki pozostają niezmienne. Agent 0.6.0 jest dołączony bez zmian.

- Mecz rankingowy: jedna systemowa pauza reconnect 90 s na logiczną drużynę.
  Kolejne rozłączenie tej drużyny przechodzi bez nowej pauzy do dotychczasowego
  180 s okresu powrotu. Ban za porzucenie pozostaje osobną karą 30 minut.
- Kapitanowie: po trzy pauzy taktyczne po 30 s. W rundzie żądanie czeka na jej
  koniec; we freezetime startuje od razu. Po wznowieniu można użyć kolejnej
  pauzy podczas nowego odliczania freezetime. Limit zużywa się przy rozpoczęciu.
  Pauza systemowa ma pierwszeństwo i zachowuje oczekujące żądanie taktyczne.
- Wcześniejsze wznowienie wymaga obu kapitanów. Timer i głosowanie używają
  tej samej ścieżki; bez restartów, utraty wyniku, wyposażenia i statystyk.
  Głosy nie odblokowują recovery ani pauzy reconnect.
- Od potwierdzonego `loaded` wszyscy mają **300 s** na połączenie i `/ready`.
  WWW i HUD korzystają z tego samego terminu. Dotyczy ranked i full_test;
  historyczny solo test zachowuje osobną ścieżkę. Trzy restarty zaczynają się
  po gotowości całego składu; ich pierwszy freezetime obsługuje już `/pause`.
- Brak gotowości anuluje mecz. Spóźnione `/ready` nie uruchamia gry. WWW ma
  15 s marginesu na transport zdarzenia, nie dodatkowy czas dla gracza.
  Awaria transportu anuluje bez kary; lease zwalnia dopiero `idle` po cleanup.
- Brak akceptacji w WWW albo potwierdzony no-show/brak `/ready`: wspólna skala
  **30 / 60 / 120 minut / 24 h**, dalej maksymalnie 24 h. Liczone są poprzednie
  naruszenia z ostatnich 7 dni; historia pozostaje. Testy i incydenty serwera
  nie dostają kar. Powtórzenie journal/worker nie nalicza kary drugi raz.
- Modal akceptacji: jeden przycisk, bez Decline i opisu przejścia do veto.
  Zaakceptowani wracają automatycznie do kolejki z zachowaniem czasu oczekiwania.
  Gotowa część party pozostaje razem; niegotowy członek jest odłączony, a jeśli
  był liderem, lider przechodzi na gotowego członka. Testy nie trafiają do ranked.
- Prawdziwe odnośniki i adresy dla meczu, rankingu, historii i panelu; język,
  gra, format i filtr historii są odtwarzane po odświeżeniu i Wstecz/Dalej.
  Wynik ma przycisk kopiowania odnośnika z pełnym ID. Krótkie ID to jego sufiks.
  Uprawnienia Flute i prywatność meczów testowych pozostają zachowane.

## Zgodność

Najpierw WWW >=0.7.1, potem kontroler 0.6.1 i agent >=0.6.0. Nie trzeba
instalować wersji pośrednich. Protocol 2, adapter amxx, assignment_contract 3,
stats_version 2, inventory 1 pozostają. `loaded.data.ready_deadline` jest
nowym polem liczbowym UNIX; podpisuje je dotychczasowy transport agenta.
Nowe capabilities: pause_policy=2, reconnect_budget=1, tactical_limit=3,
tactical_seconds=30, ready_seconds=300. Brak tych możliwości blokuje ranked.
Starsze aktywne mecze mogą skończyć się bez zmiany przypisania/config_hash.

Agent `mq_agent.py` SHA-256:
`6274415004a73cbf2750ab9138746ad87f8b84329721c80e96600097907c092a`.
Oryginalny ZIP agenta 0.6.0 SHA-256:
`b1be179add3b5b71de07c5738ab0566b923c6368e4dc01e270ed91adf34e2ce4`.

## Granice odbioru

Testy GameDLL wykonano na encjach QA w izolowanym labie. Nie zastępują Steam.
Pauzy taktyczne i 300 s działają również w full_test. Automatyczna ścieżka
disconnect/abandon, zgodnie z dotychczasową ochroną testów, pozostaje w ranked;
nie należy używać full_test jako dowodu odbioru jej 90 s.
Steam 2+8, dziesięciu klientów, wszystkie mapy i wcześniejszy crash klienta
pozostają oddzielnym odbiorem. Szczegóły: ACCEPTANCE.md.
