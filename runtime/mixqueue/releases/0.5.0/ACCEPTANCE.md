# Odbiór 0.5.0 / WWW 0.6.0 — 2026-09-29

## Zakres potwierdzony automatycznie

- PHP SQLite i MariaDB: 32 podstawowe testy, istniejące solo, reconnect/abandon/
  surrender, statystyki i read-only SystemTest; wszystkie PASS.
- Pełne testy: 1, 2 i 10 tożsamości ludzi; powtórne create/fill/join/start; bot
  captain veto; zamknięcie rosteru; uprawnienia; częściowy wynik; no ELO/no penalties;
  osobna historia; profil rankingowy bez zmian; transakcyjne delete/retry.
- Dodatkowe błędy: anulowanie lobby/ready/veto/preparing/connecting/live; timeout
  ready i veto; timeout przygotowania; utrata agenta; snapshot fallback; aktywny
  lease aż do idle; spóźnione eventy przed i po delete; błędna generacja; atomowość
  zbiorczego usuwania; gate controller/agent >=0.5.0.
- 20 testów agenta Python PASS; protokół 2, spool/retry, obcy assignment, enum,
  syntetyczne bot ID, UTF-8, brak botów ranked, owner, stare kontrakty.
- C++ kontrakt v1/v2 PASS: roster, owner, bot-only-full-test, Steam, mapy, MR/OT,
  Unicode, invalid UTF-8, wstrzyknięcia i bezpieczne cięcie znaków.
- Flute smoke: klasy, route annotations i rejestracja w kontenerze PASS.
- PHP syntax, Mago format/lint bez błędów, JS syntax i generator PL/EN PASS.
  Mago nadal zgłasza warnings/notes stylistyczne; nie jest to raport zero warnings.

## Rzeczywisty izolowany GameDLL

WAW1 /opt/csco-lab/matchbot-050, osobny kontener network=none, RCON wyłącznie
127.0.0.1:27095 w namespace. Bez zmiany SRV-107 i innych serwerów klientów.
ReHLDS 3.15.0.896, ReGameDLL 5.30.0.814, Metamod-r 1.3.0.149.

QA symuluje tożsamości 1/2 graczy poprzez jawne hooki dostępne tylko w buildzie QA.
Wszystkie dziesięć encji, damage, zabójstwa, asysta i rundy są wykonywane przez
silnik. Nie są to sesje 1/2 prawdziwych klientów Steam.

- Układ 1+9: trzy restarty, brak ruchu/teleportowania stojących encji, runda 1:0,
  5 kills, 5 deaths, 500 damage, 1 asysta, wszystkie 10 wpisów rounds=1.
- Układ 2+8: te same kontrole; inny uczestnik nie kończy testu przez /endtest,
  właściciel kończy; wynik pozostaje 1:0 bez fabrykowania zwycięzcy.
- 40 prawdziwych rund: regulaminowe 15:15, pierwsza dogrywka 18:18, druga 22:18.
  Suma 200 kills, 200 deaths, 20 000 damage, jedna celowo wywołana asysta.
  Wszystkie dziesięć wpisów ma rounds=40. Zmiana stron zachowuje roster i wynik.
- Reconnect po 1:0 zachowuje wynik i statystyki. Brak automatycznego ready człowieka.
- Dzienniki 1+9 i 2+8 (po 17 eventów) oraz pełny 22:18 (55 eventów) przeszły
  przez podpisany AgentApi, każdy event podany dwukrotnie. Wynik zgodny, brak ELO
  i ranked profile totals, lease zwolniony dopiero po idle.
- Regresje ostatniego kandydata: reconnect-solo, przerwany LO3 i kolejne /ready,
  tactical pause/resume, zewnętrzny sv_restart, bezpośredni reset GameDLL i restart
  procesu. Recovery pozostało zamknięte; brak ponownego live; normalny cleanup.
- Finalny kandydat ponownie przeszedł pełne 1+9/round/reconnect/owner-end po
  dodaniu jawnego progu assist=40 i blokady /hp,/dmg podczas rundy.

## Produkcyjna binarka bez QA

- Osobno zbudowana release, brak komendy/symbolu mq2_qa; domyślny [CSCO.GG].
- Wczytanie pełnego assignment v2, boty warmup, idempotentny load, hostname UTF-8.
- Polecenie finish_test przez prawdziwy AmxxAdapter, powtórzenie polecenia,
  jeden event test_ended z 10 rekordami i częściowym 0:0; cleanup retry → idle.
- Restart procesu pełnego testu: recovery, oryginalny hostname przywrócony,
  ponowne load odrzucone, normalny cleanup agenta → idle bez kasowania plików
  przez test. Zachowane dziennik/spool/generacja.
- Zgodność starego solo assignment v1, profil, cleanup i odrzucenie starej generacji.

## UI

PL/EN, desktop oraz szerokość 390 px: lobby, składy, avatary/linki ludzi,
syntetyczne boty bez fałszywych profili, wynik/KDA, TEST / NO ELO, modal zaproszeń
oraz potwierdzenie liczby usuwanych testów. Brak poziomego overflow całej strony;
szeroka tabela ma własne przewijanie na telefonie. Screenshoty w osobnym katalogu
artifacts/mixqueue-050/screenshots. Weryfikacja na csco.gg po wdrożeniu WWW.

## Nadal wymagany odbiór ESERV / użytkownika

- Rzeczywisty Steam CS 1.6: wygląd i kodowanie wszystkich kick/reject PL/EN
  (PL używa celowo ASCII, limit <128 bajtów); TAB i /stats w kliencie.
- Dziesięć prawdziwych klientów: transport, autoryzacja Steam i interakcje ludzi.
- Rzeczywisty flash assist (damage assist potwierdzony silnikiem; flash polega
  na sprawdzonym pAssister ReGameDLL, nie dodano osobnej symulacji flash w QA).
- Publiczne kolejki pozostają w dotychczasowym stanie, bez włączania przy wdrożeniu.
  Kontroler i agent serwerów klientów są do instalacji przez ESERV.

Nie ustalono przyczyny wcześniejszego crasha klienta. Potwierdzamy poprawny
reconnect i zachowanie zabezpieczeń, bez deklaracji naprawy źródła tego crasha.
