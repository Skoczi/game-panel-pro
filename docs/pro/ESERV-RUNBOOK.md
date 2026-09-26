# eserv.pl — instrukcja operatora, 26.09.2026

## Stan wdrożenia

Panel FR1, WAW1 i WAW2: wersja 2.0.59, commit `43e30db86151af95787c9a1493fc3637481142df`, build `20260926-api-43e30db`. Nowe funkcje są na live. Kod jest na lokalnej gałęzi `codex/eserv-audit-implementation`; nie opublikowano wydania ani PR. [Pełna lista wykonanych zadań](IMPLEMENTATION-ESERV-2026-09-26.md), [pierwotny audyt historyczny](AUDIT-ESERV-2026-09-26.md).

Kontrola po wdrożeniu 20:10 UTC: wszystkie trzy health endpointy zdrowe, zgodny commit; wszystkie kontrole dysku, odpowiedzi gry, kopii lokalnej/zewnętrznej, harmonogramów i kopii control-plane mają `ok`. Discord skonfigurowany i włączony. Niezależny monitor WAW1 aktywny. SRV-27/runtime 8 na WAW2 działa; jego kontener zachował czas startu `2026-09-22T15:26:40.006758795Z`. Wszystkie próby wykonywano na odizolowanych kopiach.

## Konto i iPhone

Sesja trwa do 12 godzin; access token 15 minut pozostaje w pamięci. Trwały refresh jest w HttpOnly/Secure/SameSite=Strict cookie. Wylogowanie i odwołanie sesji unieważniają także połączenia realtime. Lista sesji i MFA są w ustawieniach bezpieczeństwa konta.

Włącz MFA po podaniu aktualnego hasła. Panel generuje QR lokalnie i udostępnia link `otpauth` oraz klucz ręczny. Na iPhonie otwórz link w obsługującym go menedżerze kodów albo zeskanuj QR z innego ekranu. Potwierdź konfigurację aktualnym kodem, zapisz jednorazowe kody odzyskiwania poza panelem. Samo wdrożenie nie włącza MFA na koncie użytkownika. Fizyczny iPhone nie brał udziału w odbiorze.

## Kontrola codzienna

Na ekranie floty sprawdzaj **Wymaga uwagi**: gra, ostatnie zadania, dysk, świeżość kopii oraz brakujące możliwości agentów. Link prowadzi do właściwego serwera. Brak świeżych danych jest stanem nieznanym, nie zielonym wynikiem.

Alert o awarii panelu sprawdza niezależny timer WAW1 co minutę: alarm po trzech błędach, recovery po dwóch sukcesach. Panel raportuje pozostałe zdarzenia do testowego kanału Discord wskazanego przez właściciela. Sekrety webhooków pozostają poza repo i nie są podawane w dokumentacji.

Progi dysku: ostrzeżenie od 85% zajętości lub poniżej 8 GiB wolnego; krytyczny od 95% lub poniżej 2 GiB. Kopie: ostrzeżenie po 36 h, krytyczny po 72 h lub przy braku zweryfikowanej kopii. Po alarmie sprawdź ostatnią operację i jej wynik; nie kasuj automatycznie danych gry ani katalogów recovery.

## Backup i odzyskanie

- Gra WAW2: backup o 03:15 UTC, siedem kopii lokalnych i czternaście zewnętrznych. NFS OVH: `/mnt/ovh-backup/gamepanel-backups`, w agencie `/external-backups`.
- Control-plane FR1/WAW1/WAW2: timer WAW2 o 03:00 UTC, losowe opóźnienie do 120 s, czternaście zweryfikowanych archiwów na host. Kopia zawiera SQLite, konfigurację, tożsamości i dokładne obrazy panelu/agentów.
- FR1: codzienne ograniczanie starego build cache o 04:30 UTC + do 5 minut. Nie obejmuje danych gier ani używanych obrazów.

Odtwarzanie gry wymaga zatrzymanego celu. Import zewnętrzny weryfikuje SHA-256; przywracanie rozpakowuje i sprawdza archiwum, a następnie podmienia katalog przez dziennik transakcji. Poprzednie dane zostają w recovery. Po odtworzeniu uruchom grę i sprawdź A2S, mapę oraz logi. Kopia plików nie przywraca automatycznie obrazu, portów ani środowiska — zachowuj metadane i kopię control-plane.

Odbiór obejmował odtworzenie gry z NFS i uruchomienie, a dla panelu odtworzenie bazy/konfiguracji, logowanie i odszyfrowanie kluczy agentów w izolacji. Nie wykonano pełnego przełączenia publicznego panelu po utracie FR1. Certyfikaty TLS nie wchodzą do tej kopii control-plane.

## Rozwój panelu

**Game Config → mapy i dodatki:** rotacja map, admini Steam ID, aktywne pluginy AMXX oraz katalog ReHLDS, Metamod-R, AMXX, ReGameDLL_CS, ReAPI i Reunion. Paczki mają przypięte wersje i SHA-256. Instalacja wymaga zatrzymanej gry, podglądu zmian i zweryfikowanej kopii. Dodatki są dostępne w panelu, lecz nie zostały automatycznie zainstalowane na SRV-27. [Szczegóły i rollback](REHLDS-ADDONS.md).

**Harmonogramy:** opcjonalny zapis stanu, stop, backup offline, opcjonalna aktualizacja, start i A2S. Błąd/przerwanie wyłącza harmonogram; operator sprawdza kroki przed ponownym włączeniem. Próba gry obejmowała wariant bez aktualizacji Steam; gałąź aktualizacji zweryfikowano testami z podstawionym aktualizatorem. [Sekwencje](MAINTENANCE-WORKFLOWS.md).

**Clone server:** nowa tożsamość i porty, ten sam albo inny węzeł, źródło zachowane. Cel wymaga dokładnego obrazu, zgodnych zasobów i przydziału IP/portów. Obie kopie pozostają zatrzymane po operacji. Przełączenie DNS/integracji i start są świadomymi krokami operatora. Próba transferu użyła dwóch agentów i trzech oddzielnych baz na jednym fizycznym WAW2; nie był to test utraty łączności między fizycznymi hostami. [Transfer](SERVER-CLONING.md).

**API i webhooki:** tokeny mają zakres wybranych serwerów oraz bieżące uprawnienia właściciela. Power działa w tle, z trwałym kluczem idempotencji. Podpisany webhook jest osobną integracją, domyślnie wyłączoną; wymaga własnego odbiornika HTTPS, weryfikacji HMAC i deduplikacji ID. [Kontrakt i przykłady](API-POWER-WEBHOOKS.md).

## Odbiór i rollback

260/260 testów backendu Linux. Pełny pierwszy przebieg UI: 222 sukcesy i 17 usterek testów/regresji; po poprawkach powiązane zestawy: 89/90, następnie cały zestaw konsoli 50/50. Wszystkie 239 unikalnych scenariuszy ostatecznie przeszły. Poprawiono rzeczywiste wykrywanie wysokiej konsoli, odświeżono stare scenariusze sesji i brakujące odpowiedzi testowe. Oba buildy oraz rzeczywista akceptacja HTTP/WS/MFA passed. `npm audit --omit=dev`: zero zgłoszeń w obu lockfile; nie jest to skan obrazów ani pełny pentest.

Rollback kodu jest zapisany w:

- FR1 `/opt/gamepanel-pro/local-patches/20260926-api-43e30db/rollback`.
- WAW1 `/srv/eserv-agent/local-patches/20260926-api-43e30db/rollback`.
- WAW2 `/srv/gamepanel-agent/local-patches/20260926-api-43e30db/rollback`.

Nie cofaj bazy bez analizy sesji, MFA i dzienników idempotencji. Nie usuwaj rekordów operacji, aby „spróbować jeszcze raz”. Cofnięcie do wersji sprzed MFA osłabia uwierzytelnianie. Scoped nginx upload dla transferu ma osobne kopie `/var/backups/waw1.eserv.pl.before-transfer` i analogiczną WAW2.

Nagłówki HTML, HSTS i ochrona ramek są wdrożone; pełny `script-src` pozostaje w CSP Report-Only. Nie przedstawiać tego jako pełnego egzekwowania CSP. Nie wykonano audytu WCAG ani izolacji hostingu dla dowolnych niezaufanych klientów.

Usunięto dziewięć rozpoznanych katalogów po nieudanych próbach na kopiach, po sprawdzeniu braku aktywnych mountów. Raporty udanych prób i zapis sprzątania pozostają w `/srv/gamepanel-agent/restore-tests`; katalogi danych gry, backupy i obrazy rollback nie były kasowane.

Końcowa kopia control-plane 20:14 UTC: FR1 217209098 B, WAW1 83449727 B, WAW2 83409464 B. Wszystkie trzy SHA-256 i SQLite integrity_check poprawne; archiwa obejmują dokładne obrazy builda 20260926-api-43e30db. Pokwitowanie: /var/lib/eserv-backups/last-success.json na WAW2.
