# Odbiór automatyczny — MatchBot 0.6.4 / WWW 0.7.6

Agent: niezmienione 0.6.1. Protocol 2, adapter amxx, assignment_contract 3,
stats_version 2. Poniższe wyniki nie oznaczają odbioru przez Steam.

## Zbudowane artefakty

- Linux 32-bit, produkcja: `af5ed8c138180a7614be80dc981b10d878a19e9dfe9e16549adcd9ffa711ca31`.
- Linux 32-bit, QA: `c7a77c900547081d5332326319745531f602413855ce47b27f07b807ac549387`.
- Źródło agenta 0.6.1: `2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a`.

## C++ i kontrakt

PASS: siedem zestawów testów z AddressSanitizer i UndefinedBehaviorSanitizer:
contract, feedback, safety, statistics, bots, break, end. Macierz MR12/MR15
dla 5v5, tylko MR8 dla 2v2, tylko OT MR3, oba kierunki zwycięzcy i cztery kolejne
dogrywki. Weryfikacja legacy/v2/v3, ranked/full/solo, rosteru i kapitanów.
Testy przerw obejmują kolejne remisy dla każdego MR. Istniejące testy tożsamości,
głosów kapitanów, obrażeń, statystyk, nawigacji i retencji pozostają zielone.

## Rzeczywista GameDLL w odizolowanym laboratorium

Kontener `mq2-matchbot-063-profile`, sieć `none`, dedykowany bind
`/opt/csco-lab/matchbot-063-profile:/data`. To istniejąca kopia laboratorium,
nie SRV-107. Zachowano journal, generacje/high-water i agenta 0.6.1. Encje testowe
zastępują klientów tylko w tej automatyzacji. Żadna binarka nie została wdrożona
przez ten proces na aktywny serwer gry.

PASS MR12: wynik 12:12 → 15:15 → 19:15, zmiana stron po 12 rundach, pięć rzeczywistych
przerw po 20 s, dogrywki 3+3, 34 kompletne snapshoty 10 graczy, pojedynczy `finished`,
wyznaczony termin retencji 180 s po końcu. Nie wystąpił przedwczesny koniec
przy 13:12 lub 16:15. W tym przebiegu nie odczekiwano pełnych 180 s;
pełny czas retencji był osobnym odbiorem 0.6.3, a backendowy termin pozostaje
objęty testami WWW 0.7.6.

PASS regresja pełnego wyniku: MR15 kończy 16:0 po zmianie stron przy 15:0;
MR8 kończy 9:0 po zmianie stron przy 8:0. Po trzech rzeczywistych restartach
MR8 ma 120 s aktywnej rundy i 8 s freeze time. MR15 zachowuje 105 s / 10 s.

Pierwsze podejście harnessu do MR8 zatrzymał fałszywy alarm: odczyt połączył
stan sprzed LO3 ze stanem po rozpoczęciu LO3. Zweryfikowano zachowanie GameDLL
i poprawiono harness na pojedynczą odpowiedź ze stanem, freeze, LO3 i liczbą
zakończonych restartów. Powtórzono tylko MR8 i dalsze próby. Zdarzenia oraz log
pierwszego podejścia są zachowane; ta korekta nie zmieniła binarki ani hashów.

PASS: trzy oddzielne naruszenia `mb_play_rounds`, `mb_play_rounds_ot` oraz
`mb_play_ot_mode` kierują kontroler do recovery przed naliczeniem błędnej rundy.
Zachowany wynik 1:0; ponowny `load` jest odrzucany. Po kontrolowanym cleanup
zachowana jest rosnąca generacja i historia. Łącznie ukończono 59 rund
trzech formatów oraz siedem rzeczywistych przerw po 20 s.

PASS binarka produkcyjna: warmup MR8 bez klienta oraz warmup pełnego testu MR12
z dziewięcioma natywnymi botami; efektywne 24/6 rund regulaminowych/OT. Odrzucenie
niedozwolonych formatów 5v5, brakującej mapy, uszkodzonego przypisania i błędu
zapisu, bez fałszywego `loaded`. Idempotentny load, pojedynczy `test_ended`,
cleanup hostname/botów i odmowa starej generacji.

Rzeczywisty restart procesu z aktywnym przypisaniem MR12 wywołał recovery,
zablokował ponowny load i pozwolił na normalny cleanup, bez resetu high-water.
Końcowy stan idle/healthy, oryginalny hostname, generacja 118. Dokładny kontener
laboratorium został zatrzymany. Sześć końcowych plików JSON, ich hashe i hashe
obu binarek indeksuje `evidence/release-proof.json`.

## WWW i statystyki po rundzie

PASS na SQLite i odizolowanej MariaDB: dziewięć zestawów `match_rules`, `run`,
`test_matches`, `server_tests`, `game_readiness`, `post_match_grace`,
`round_snapshots`, `round_timeline`, `system_test`.

Sprawdzono: MR12/MR15/MR8 i powtarzane dogrywki, brak zgody na błędne remisy,
niezmienność match.rules/podpisu po zmianie domyślnego formatu, zachowanie MR15
i wyłączonej kolejki przy instalacji, świeży status kontrolera >=0.6.4 przed
rezerwacją i ponownie przed `load`, bezpieczne anulowanie po downgrade podczas veto,
brak ELO/kar i usuwania historii, retencję 180 s, osobny wybór dla full/solo oraz
autoryzację admina i ścisły typ całkowity pola MR.

Snapshoty: dokładna runda, stabilny zamknięty roster, właściwy serwer/mecz/generacja,
kompletne V2, sekwencja, luki, duplikaty, spadek wyniku, terminalne i późne
obserwacje, anulowanie, brak ujawnienia Steam ID lub trwającej rundy, prywatny
test tylko uczestnik/admin. Demo ma spójny syntetyczny rejestr, a ostatni snapshot
jest identyczny z końcowym scoreboardem. Rzeczywista historia nie jest interpolowana.

PASS przeglądarka: MR15 R8/R25, MR12 połówki 12+12 i runda 27 dogrywki, Wingman MR8,
powrót do bieżących danych LIVE, brak danych w języku PL, ekran 390×844 bez poziomego
przepełnienia dokumentu, zachowanie zaznaczenia/przewijania, wybór MR w panelu i testach,
odświeżenie czystego wyboru z serwera i zachowanie niezapisanego wyboru.
Brak błędów JavaScript. Bundles PL/EN i `npm run check` poprawne.
Szczegóły i ograniczenia znajdują się w dołączonych raportach audytu.

## Pozostały odbiór

Nie wykonano w tym wydaniu testu prawdziwych klientów Steam 1+9 / 2+8 / 10,
praktycznego odczytu TAB/CHAT na Steam, pełnego odbioru nawigacji wszystkich map,
ani pełnej macierzy crash/reconnect podczas każdego rodzaju pauzy/przerwy.
Automatyczny test encji i smoke procesu nie zastępują tych przypadków.
ESERV wykonuje odbiór po kontrolowanym restarcie pustego serwera bez lease.
Przyczyna wcześniej zgłoszonego crasha klienta pozostaje nieustalona.

Publiczne kolejki/pula pozostają wyłączone. Nie usunięto historii ani nie
resetowano produkcyjnej generacji, journalu, spoolu lub kluczy. Poprzednie
wydania zostały sprawdzone SHA-256 i zachowane pod oryginalnymi nazwami.
