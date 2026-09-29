# Zakres odbioru 0.6.2

Odbiór automatyczny zakończony 2026-09-29 w odizolowanym laboratorium
ReHLDS/ReGameDLL, na de_dust2. Kontroler 0.6.2, agent 0.6.1, WWW 0.7.2.
To testy silnika i API; stanowisko człowieka w przebiegu QA było symulowane,
nie był to klient Steam.

Końcowa binarka QA: SHA-256
`631231029ff32a4c93c9c56a80751d531522270eb557d4bd8f89885e3e47b187`.
Końcowa binarka produkcyjna: SHA-256
`b838e0968bde5a1667096a09d087b5805f035ef7974c3a7e9c2ecf601cab4908`.
Agent: SHA-256
`2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a`.

Końcowy przebieg QA (native-bots-final-proof.json):

- Full test 1+9: dziewięć prawdziwych botów ReGameDLL, poprawne podpisane
  tożsamości, nazwy i drużyny; loaded przed pojedynczym connected każdego bota.
- Automatyczna gotowość botów, /ready człowieka, trzy restarty i LIVE z czasem
  rundy 30 s. Obie drużyny botów przemieszczały się żywe w tej samej rundzie;
  potwierdzono strzelanie. Pierwsza zakończona runda: 491 obrażeń i 4 zabójstwa
  z rzeczywistej walki, bez wstrzykiwania obrażeń ani komend zabijania.
- Naturalne wygaśnięcie pauzy taktycznej, pojedynczy resume i zachowany wynik.
  Sam głos ludzkiego kapitana nie zastępuje zgody przeciwnego bota-kapitana.
- Cleanup usuwa boty i marker original-bots.txt, odtwarza zapisane ustawienia
  AI; quota wraca do zera. Ranking zachowuje 105 s i odrzuca obcego bota;
  bot jest też odrzucany w idle.
- Solo: jeden natywny przeciwnik, stabilna tożsamość i poprawna strona,
  automatyczna gotowość, trzy restarty, 30 s i cleanup.
- Wyłączone AI i brak NAV: bezpieczne odrzucenie przed zużyciem generacji
  i bez zdarzenia loaded. Uszkodzone NAV obejmują osobne testy parsera.

Końcowa binarka produkcyjna (production-final-proof.json): brak komendy QA,
dziewięć natywnych botów w warmup, ponowienie load bez duplikacji loaded,
zakończenie z migawką dziesięciu zawodników, cleanup, odtworzenie hostname
i ustawień. Zweryfikowano odrzucenia konfiguracji/mapy/storage oraz starej
generacji. Rzeczywisty restart procesu z aktywnym markerem uruchomił recovery:
bez automatycznego tworzenia botów, bez ponownego load i z normalnym cleanup.
Końcowy stan: healthy idle, puste przypisanie, zero graczy, quota 0,
zachowana najwyższa generacja 96. Kontener laboratoryjny został zatrzymany.

Sprawdzone przed integracją AI: rzeczywisty GameDLL 30 s full_test i solo,
naturalne wygaśnięcie rundy (bez przesuwania jej zegara), pojedynczy round,
następna runda i pauza/wznowienie, ranking 105 s po cleanup.
Dowód: var/implementation-062/roundtime-proof.json. To wcześniejsza binarka QA,
nie dowód działania ostatecznej binarki po integracji AI.

Automatycznie: pięć zestawów C++ ASan/UBSan, 33 testy agenta, kontrola JS/locales;
ai_test_bots, map_inventory, server_tests, test_matches i test_match_failures
na SQLite i MariaDB. Nowe błędy AI: bez utraty historii/generacji, bez ELO/kar,
zwolnienie lease dopiero po potwierdzonym idle; komunikaty PL/EN.

Dodatkowo audit_native_062_journal odtworzył na SQLite i MariaDB cztery
przypadki z końcowego journalu: walkę AI, pauzę, ranked i solo. Łącznie 69
zdarzeń w osobnych scenariuszach (część wspólnego prefiksu jest powtarzana),
podpisanych i przyjętych przez AgentApi. Liczniki zachowano dokładnie:
491 obrażeń / 4 zabójstwa oraz późniejsza migawka 817 / 6. Duplikaty nie
zmieniały stanu; zachowano historię, brak ELO, kar i zmian statystyk overall.
Zwolnienie lease sprawdzono po syntetycznym podpisanym idle — ten fragment
jest odbiorem backendu, nie dodatkowym dowodem natywnego cleanup.

Nie wykonano odbioru Steam tej wersji, 2+8 z dwoma ludzkimi kapitanami,
dziesięciu prawdziwych klientów ani AI na wszystkich mapach. Przyczyna
wcześniejszego crasha klienta pozostaje nieustalona. Na SRV-107 nie instalowano
binarki gry. Publiczne kolejki pozostają wyłączone.
