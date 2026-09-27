# Podręcznik operatora

[Dokumentacja](README.pl.md) · [English](USER-GUIDE.md)

## Lista i nawigacja

Game Servers pokazuje dostępne serwery ze wszystkich node. Domyślnie sortuje po numerycznym IP i porcie. Filtruj po node, grze lub statusie, przełączaj karty/listę i ustaw własną kolejność przeciąganiem. Wybór node filtruje listę oraz Host Status; nie przenosi serwera ani nie zmienia runtime otwartej usługi.

Serwer ma zakładki Console, File Editor, Game Config, Backups, Schedules, Settings i Activity. Dostępność zależy od uprawnień i runtime. Strony oraz katalogi mają adresy URL obsługujące zakładki i przyciski Wstecz/Dalej. Link nie zastępuje uprawnień.

## Konsola i stan gry

### Gracze online

Karty i tabela pokazują ostatni licznik graczy z A2S. Kliknięcie otwiera wyszukiwalną listę nazw, wyników i czasu połączenia. Wymaga uprawnienia **View online player list** (`server.players.read`), dostępnego przy edycji użytkownika i dostępu do serwera. Bez niego użytkownik widzi sam licznik. Nowe profile administratora serwera zawierają to uprawnienie; istniejące przydziały pozostają bez zmian.

Obsługiwane są gry z włączonym monitoringiem A2S, w tym CS 1.6/ReHLDS, Source, CS:GO, CS2 i Classic Offensive. Licznik korzysta z aktualizacji monitoringu, a otwarta lista odświeża się co 10 sekund. Niektóre gry udostępniają liczbę graczy, ale ukrywają ich nazwy. Brak świeżych danych oznacza kreskę, nie zero. Dla zdalnych node należy zaktualizować panel i agentów.

Start, Stop i Restart dotyczą wybranego serwera. Konsola ma historię komend, kopiowanie, czyszczenie, pełny ekran i Search. Filtry wyszukiwania rozwijasz przyciskiem; dolny uchwyt zmienia wysokość konsoli.

Działający kontener nie musi oznaczać odpowiadającej gry. Dane unknown/stale nie są zerowym zużyciem ani potwierdzeniem zatrzymania. Host Status zbiera problemy operacyjne; limity zasobów ustawiasz w Settings serwera.

## Pliki

File Editor obsługuje katalogi, upload, edycję tekstu i menu kontekstowe. Kopiowanie pliku nie nadpisuje istniejącego celu. Ctrl+F w przeglądarce plików otwiera wyszukiwanie plików; edytor tekstu ma własną wyszukiwarkę.

Save zapisuje zawartość edytora bez automatycznego scalania cudzych zmian. Zapis jest atomowy. Wczytanie wcześniejszej wersji z historii wymaga Save, aby ją zastosować. Historia operacji i odzyskiwania ma ograniczoną retencję. Na telefonie dodatkowe akcje są w menu, zamiast wypełniać pasek ikonami.

## Konfiguracja i dodatki

Game Config pokazuje ustawienia oraz pliki zadeklarowane przez template. Dla CS 1.6 dostępne są wizualne edytory rotacji map i administratorów AMXX. Stan dodatku jest oddzielony od przycisków instalacji/usunięcia.

Operacja dodatków pokazuje postęp backupu i instalacji. Zatrzymaj grę, gdy jest to wymagane, i zaczekaj na zakończenie. Usuwanie zarządzane przez panel dotyczy jego plików; wykrycie zewnętrznej instalacji nie oznacza własności wszystkich plików. Udana instalacja nie potwierdza zgodności każdego pluginu z daną grą.

Source/CS:GO/CS2 używają wspólnego portu Game/Query/RCON i osobnego TV. HLTV działa jako oddzielny serwer pośredniczący. Classic Offensive wymaga lokalnych plików gry i współdzielonych paczek; instrukcje są w dokumentacji runtime.

## Backupy, klonowanie i transfer

Backup Native zawiera prywatne serverfiles. Kopia działającej gry jest best-effort: gra może nie zapisać całego stanu. Gdy potrzebna jest spójna kopia offline, zatrzymaj grę.

Restore sprawdza i przygotowuje archiwum przed zamianą plików. Zachowuj dzienniki odzyskiwania do potwierdzenia wyniku. Retencję i kopie zewnętrzne trzeba skonfigurować. Współdzielone paczki są kopiowane osobno od prywatnych plików serwera.

Clone znajduje się na dole Settings. Sprawdź stan źródła, node docelowy, ID, limity i porty. Obsługa klonowania/transferu zależy od układu danych i runtime; nie jest dowolnym kopiowaniem kontenerów Docker. [Zgodność](pro/FEATURES.md).

## Konta i uprawnienia

User widzi przypisane serwery. Operator administruje panelem z ochroną konta właściciela. Presety rozdzielają podgląd konsoli, komendy/power i administrację serwerem. Server-admin dodaje pliki, backupy, harmonogramy i SFTP bez terminala oraz edycji CPU/IP/portów i środowiska startowego.

Account security pozwala włączyć authenticator i unieważniać sesje. Tokeny API są osobnymi poświadczeniami z zakresem, datą ważności i przypisaniem serwerów. Nadal obowiązują aktualne uprawnienia właściciela tokenu.

## SFTP, sieć i współdzielone pliki

Włącz SFTP w Settings, jeśli node je obsługuje. Korzystaj z adresu i loginu pokazanego w panelu. Dostęp przez dedykowane IP gry wymaga poprawnej konfiguracji hosta; nie zastępuj go dowolnie adresem zarządzania node.

Additional IPs zmienia sieć hosta. Użyj adresu/MAC przydzielonego przez dostawcę i sprawdź plan operacji. Usługa startowa node odtwarza interfejsy niezależnie od uruchomienia panelu. Allocations określa dostępne pule portów; panel nie zamawia nowych IP u operatora.

Shared packages to niezmienne wersje plików na node. Gry współdzielą zasoby tylko do odczytu, zachowując własną konfigurację i dodatki. Nowy node musi mieć zgodne paczki i runtime przed instalacją lub odtworzeniem.

## Gdy coś nie działa

- Node online, ale serwer niedostępny: sprawdź połączenie panel → agent i tożsamość runtime; sam heartbeat nie wystarczy.
- Brak akcji: sprawdź rolę, członkostwo i możliwości runtime.
- Instalacja stoi: sprawdź operację, logi, dysk i odzyskiwanie; nie wysyłaj duplikatów.
- Restore zablokowany: sprawdź zatrzymanie gry, układ danych, miejsce, shared packages i dziennik.
- Timeout API: sprawdź zapisane ID operacji oraz klucz idempotencji przed nowym żądaniem.

[Wdrażanie i odzyskiwanie](pro/DEPLOYMENT.md) · [API v1](pro/API-V1-GUIDE.md).
