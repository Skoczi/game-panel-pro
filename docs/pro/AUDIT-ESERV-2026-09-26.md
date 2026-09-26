# Audyt eserv.pl i plan rozwoju — 26.09.2026

## Wniosek

Panel ma sensowną bazę do dalszego rozwoju: flotę z agentami, uprawnienia per serwer, monitoring odpowiedzi gry, konsolę, konfigurator, harmonogramy, kopie, historię plików i API integracyjne. Najbliższy etap powinien domknąć bezpieczeństwo sesji, wdrożenie ochrony kopii i widoczność problemów. Dopiero potem warto rozszerzać obsługę gier oraz automatyzację. Nie ma uzasadnienia do przepisywania całości.

## Zakres i ograniczenia

- Przegląd źródeł `game-panel-skoczi`, commit `227819833397f76c8728d168763fb0fd0d129024`.
- Odczyt FR1 przez SSH: kontenery, zasoby, porty, mounty, wersja, konfiguracja frontendu, lista timerów i root crontab.
- Publiczne GET: HTML, HTTP→HTTPS, health i odmowa dostępu do `/api/servers` bez tokenu.
- Zalogowany interfejs: flota, konsola, konfigurator ReHLDS, backupy, harmonogramy, Nodes i Panel Settings; wizualny przegląd desktop.
- `npm audit --omit=dev --json` dla obu lokalnych lockfile: 0 zgłoszonych podatności produkcyjnych w backendzie i frontendzie. To nie jest skan obrazów ani dowód braku podatności aplikacji.
- Nie wykonywano pełnego pentestu, prób obciążeniowych, testu uprawnień drugiego użytkownika, odtwarzania backupów, aktualizacji ani zmian konfiguracji. Nie uruchamiano ponownie pełnego CI. Kod nie został zmieniony.
- Użytkownik dopuścił zatrzymanie serwera testowego; nie było potrzebne. Wszystkie otwarte potwierdzenia zatrzymania anulowano. Nawigacja klawiaturą działała poprawnie; problemy z trafianiem kliknięć w przeglądarce narzędziowej nie są zaklasyfikowane jako błąd panelu.
- Wersje WAW1/WAW2 odczytano w Nodes; nie wykonywano audytu systemów tych hostów przez SSH.

## Potwierdzony stan

| Obszar | Obserwacja |
|---|---|
| Panel | FR1, `/opt/gamepanel-pro`, 2.0.59, commit zgodny z lokalnym repo |
| Agenty | WAW1 i WAW2 online, oba 2.0.58 |
| Kontenery panelu | Backend healthy; backend i frontend bez restartów od startu 22.09 |
| Ekspozycja | Backend 127.0.0.1:18081, frontend 127.0.0.1:18080; publiczny ruch przez reverse proxy/Cloudflare |
| Zasoby panelu | Chwilowy odczyt: backend około 68 MiB RAM i 0,08% CPU; frontend około 8 MiB RAM |
| Limity | Backend 1 GiB/2 CPU/256 PID; frontend 256 MiB/1 CPU/128 PID; oba bez privileged |
| Dysk FR1 | 108G, 87G zajęte, 17G dostępne, 85% według df |
| Docker FR1 | Build cache 46,74 GB, z czego 44,22 GB raportowane jako odzyskiwalne; to dane Dockera, nie gwarancja odzysku identycznej liczby bajtów na filesystemie |
| Serwer testowy | SRV-27, ReHLDS, Running i Game responding, 0/16 graczy w czasie oględzin |
| Backup testowego serwera | Jedno lokalne archiwum z 22.09, 458,9 MB, operacja completed |
| Harmonogramy | Jedno aktywne zadanie komendy gry co godzinę; brak zadania backupu w obejrzanym serwerze |
| Alerty | Discord notifications wyłączone; historia zawiera wcześniejsze udane doręczenia |
| Aktualizacje | Release metadata: managedUpdates=false; są snapshoty wdrożeniowe |

Uptime FR1 wynosi około 499 dni; sam ten fakt nie dowodzi brakujących poprawek. Osobno należy sprawdzić aktualizacje kernela i zaplanować ewentualne okno serwisowe.

## Ustalenia według priorytetu

P1 oznacza najbliższy etap przed szerszym udostępnieniem. P2 oznacza kolejną iterację. To priorytety operacyjne i produktowe, nie punktacja CVSS.

### P1 — sesje i logowanie administratorów

Token JWT ma ważność 120 godzin. Frontend zapisuje go w localStorage oraz cookie tworzonym przez JavaScript, bez atrybutu Secure. Cookie nie może być HttpOnly, bo tworzy je JavaScript. Wylogowanie usuwa stan przeglądarki, ale nie unieważnia danego tokenu na backendzie. Istniejąca kontrola tokenVersion unieważnia poprzednie tokeny m.in. po zmianie hasła. W przejrzanym przepływie logowania brak MFA.

Dowody: `backend/src/utils/auth.ts:6`, `frontend/utils/api.ts:204`, `frontend/utils/api.ts:306`, `frontend/utils/api/runtime.ts:37`, `backend/src/routes/auth.ts:227`, `backend/src/middleware/auth.ts:49`.

Skutek: skopiowany token może być używany po zwykłym wylogowaniu aż do wygaśnięcia lub unieważnienia. XSS, gdyby wystąpił, ma dostęp do tokenu; audyt nie potwierdził podatności XSS. Brak Secure pozwala przeglądarce wysłać cookie także przy wejściu przez HTTP przed przekierowaniem, jeśli klient nie ma skutecznej polityki HSTS.

Zalecenie: usunąć zbędną kopię tokenu w cookie, zaprojektować serwerowe sesje/odwoływalne identyfikatory, krótszy access token, listę aktywnych sesji i logout z unieważnieniem. Docelowo cookie HttpOnly+Secure+SameSite z właściwą ochroną CSRF oraz dostosowaniem WebSocket. MFA dla kont uprzywilejowanych. Nie wystarczy samo skrócenie JWT.

Odbiór: token po logout nie działa; zmiana hasła zamyka stare sesje; poprawne zachowanie wielu kart i WebSocket; brak tokenów sesji w localStorage; testy CSRF przy uwierzytelnianiu cookie.

### P1 — nagłówki bezpieczeństwa nie obejmują dokumentu HTML

GET `/` nie zwraca CSP, X-Frame-Options, HSTS, X-Content-Type-Options ani Referrer-Policy. API zwraca te zabezpieczenia przez Helmet. Konfiguracja frontendu ma nagłówki cache, lecz nie bezpieczeństwa. CSP z odpowiedzi JSON nie chroni dokumentu aplikacji.

Dowody: odczyty publicznych nagłówków; `frontend/nginx.conf:1`, `backend/src/index.ts:131` (okolice middleware Helmet).

Zalecenie: objąć HTML właściwymi nagłówkami, zacząć CSP w Report-Only i dopasować politykę do Monaco, workerów, WebSocket, motywów i obrazów brandingu. Następnie włączyć egzekwowanie, w tym frame-ancestors. Zachować nagłówki również w nginx location z własnym add_header.

Odbiór: GET `/` i bezpośrednie wejście na trasę serwera mają politykę; login, edytor, konsola i logo działają; nie stosować szerokiego unsafe-eval tylko w celu uciszenia błędów.

### P1 — ochrona backupów jest zaimplementowana, ale niedomknięta na live

Panel 2.0.59, agenty 2.0.58. `BackupTab.tsx:427` ukrywa nowe ustawienia bez capability `nativeBackupPolicy: 1`. W UI testowego serwera nie ma Backup protection ani harmonogramu kopii. Jedyna pokazana kopia jest sprzed czterech dni. Ponieważ to testowy serwer, nie jest to dowód utraty danych produkcyjnych.

Zalecenie: aktualizacja agentów z rollbackiem; wybór dedykowanego miejsca zewnętrznego; harmonogram, retencja, próbna kopia i odtworzenie izolowanej gry. Mechanizm 2.0.59 obsługuje NFS/SMB, nie bezpośredni S3. Nie deklarować ochrony poza hostem przed udanym transferem i próbą odzyskania.

Osobno trzeba potwierdzić backup samego panelu: bazy SQLite, konfiguracji, kluczy/tożsamości agentów i instrukcji odtworzenia. FR1 ma codzienny `/opt/scripts/backup.sh`, ale zakres i możliwość przywrócenia panelu nie zostały potwierdzone. Nie twierdzimy, że backupu hosta nie ma. Snapshot przed aktualizacją nie zastępuje regularnego backupu poza hostem. Archiwa gry nie odtwarzają całej floty.

Odbiór: udany transfer poza host, sprawdzona suma, uruchomienie odtworzonej gry w izolacji, pomiar czasu odzyskania i udokumentowana dopuszczalna utrata danych.

### P1 — dysk FR1 wymaga marginesu i kontroli wzrostu

85% zajętości oraz około 44 GB potencjalnie odzyskiwalnego build cache. Sam katalog panelu zajmuje około 774 MB, więc problem nie wynika wyłącznie z danych panelu. `/var/log` zajmuje około 3,4 GB. Host obsługuje również inne usługi.

Zalecenie: kontrolowane czyszczenie starego cache po sprawdzeniu bieżących buildów, limit/retencja cache, alerty na wolne bajty i procent zajętości. Zachować używane obrazy i rollback. Bez automatycznego prune wolumenów. Niczego nie usunięto podczas audytu.

W kodzie jest dolna rezerwa 64 MiB dla wybranych operacji (`storageReserve.ts:2`); to zabezpieczenie awaryjne operacji, nie wystarczający zapas całego hosta.

### P2 — utrata monitoringu panelu nie powinna wyciszać alertów

Discord jest wyłączony. Worker alertów działa w procesie panelu, więc awaria FR1 może uniemożliwić mu wysłanie powiadomienia. Są już kategorie awarii gry, połączenia agenta, backupów, harmonogramów i restartów — nie trzeba budować tego od zera.

Zalecenie: aktywacja istniejących alertów dla wskazanego odbiorcy oraz niezależny monitoring zewnętrzny panelu. Dodać alarm pojemności dysku i wieku ostatniego poprawnego backupu. Przełącznik alertów pozostawiono bez zmian; nie wysyłano wiadomości.

### P2 — ograniczanie żądań wymaga dopracowania

Login przechowuje mapy IP/loginów bez limitu liczby kluczy i bez globalnego usuwania wygasłych wpisów. `pruneBucket` czyści zawartość użytego wpisu, nie całą mapę. Usunięcie klucza występuje przy poprawnym logowaniu. To potencjał narastania pamięci, a nie potwierdzony incydent DoS. Źródło: `backend/src/routes/auth.ts:51–140`.

API v1 ma limit 240/min na `req.socket.remoteAddress` przed uwierzytelnianiem oraz 120/min na token. Przy wspólnym reverse proxy wiele integracji dzieli pierwszy budżet; nieautoryzowane żądania również go zużywają. Kod jawnie opisuje tę semantykę. Źródło: `backend/src/routes/publicApi.ts:41–60`, `backend/src/services/apiRateLimit.ts`.

Zalecenie: ograniczone mapy z TTL i testami; identyfikacja klienta wyłącznie z kontrolowanego łańcucha proxy, osobne limity nieautoryzowane/autoryzowane, budżet tokenu i globalny limit ochronny. Nie ufać bezwarunkowo X-Forwarded-For. Nie wykonywano testu zalewania live.

### P2 — zgodność wersji jest zbyt mało czytelna dla operatora

Nodes pokazuje wersje i heartbeat, ale brak wymaganej capability skutkuje ukryciem funkcji backupu. Operator widzi nową wersję panelu, lecz nie dostaje w tej sekcji wyjaśnienia brakującej funkcji.

Zalecenie: widoczny stan „wymaga aktualizacji agenta”, porównanie capabilities i buildów, lista brakujących funkcji, kontrolowane aktualizowanie jednego węzła naraz. Zachować istniejący model capability zamiast uzależniać wszystko od porównania numerów wersji.

### P2 — czytelność interfejsu i dostępność

- Konfigurator ReHLDS ma logiczne grupy i wyraźnie odróżnia zapis pliku od zastosowania konfiguracji w grze. To warto zachować.
- Nagłówek konfiguratora, opis pliku i kolejne warstwy kart zabierają znaczną część pierwszego ekranu. Skrócić wstęp, więcej miejsca oddać ustawieniom.
- Lista backupów pokazuje długą techniczną nazwę archiwum. Pokazywać nazwę nadaną przez użytkownika, wiek, rozmiar, spójność, weryfikację i lokalizację kopii; pełną nazwę dać w szczegółach.
- Konsola zawiera dużo historycznych logów instalacji i powtarzalnych ostrzeżeń. Dodać wyszukiwanie, filtry i grupowanie powtórzeń z licznikiem, zachowując surowy log do pobrania.
- `frontend/index.html:8` deklaruje `maximum-scale=1.0, user-scalable=no`. Usunąć blokowanie zoomu i przeprowadzić osobny odbiór na urządzeniu mobilnym. Nie wykonano pełnego audytu WCAG.
- Uporządkować branding eserv.pl i słownik PL/EN przed udostępnieniem klientom. Obecny branding wygląda na celowo testowy, nie jest błędem technicznym.

### P2 — utrzymanie kodu i dokumentacji

Repo zawiera 69 plików testów backendu i 29 plików spec UI (to liczba plików, nie wykonanych testów). CI ma buildy, testy UI, wdrożenia i integracje Docker. To dobra baza.

Duże moduły, m.in. InstallGameServer, GameTemplates, ServerSettingsModal i GameConfigTab, warto dzielić przy zmianach funkcjonalnych. Dokumentacja historyczna opisuje starsze wersje i poprzednie ograniczenia. Dodać krótki aktualny runbook z mapą źródła → release → host → agent; oznaczyć stare raporty jako historyczne. Benchmark 2.0.49 nie stanowi pomiaru szybkości obecnego live.

## Plan rozwoju

| Etap | Konkretny rezultat | Względny nakład |
|---|---|---|
| 1. Bezpieczeństwo i operacje | Sesje/MFA, nagłówki HTML, limitery, zapas dysku, zgodne agenty, aktywna ochrona kopii i test odzyskania | Średni/duży |
| 2. Widok „Co wymaga uwagi” | Jedna lista: gra nie odpowiada, agent offline/stary, backup przeterminowany, dysk pełny, zadanie nieudane; odnośnik do rozwiązania | Średni |
| 3. Wygoda operatora | Czytelne backupy, filtry konsoli, skrócenie formularzy, diagnostyka możliwości agentów, testy mobile/klawiatura | Mały/średni, porcjami |
| 4. Głębsza obsługa ReHLDS | Mapy i mapcycle, zarządzanie adminami, wersjonowane paczki Metamod/AMXX, zgodność dodatków, backup przed zmianą i rollback | Duży |
| 5. Bezpieczna automatyzacja | Rozszerzenie istniejących harmonogramów: zapis stanu gry → backup → aktualizacja → healthcheck, z warunkami i jasnym wynikiem każdego kroku | Duży |
| 6. Klonowanie i przenoszenie | Najpierw klon testowy na tym samym węźle, później migracja pomiędzy węzłami z weryfikacją portów, plików, tożsamości i rollbackiem | Duży |
| 7. Integracje | Rozszerzenie API v1 o wybrane operacje power i podpisane webhooki; odbiorcy korzystają z tych samych uprawnień i dzienników | Średni |

Nie trzeba od nowa implementować API, alertów, monitoringu gry, historii plików ani kreatora konfiguracji — są już obecne. S3 jest sensownym przyszłym adapterem storage, ale wdrożenie istniejącego NFS/SMB daje wcześniej działającą ochronę.

Jeżeli celem jest płatny hosting dla obcych klientów, potrzebny jest osobny etap: organizacje, limity zasobów/użytkownika, zaproszenia i role, proces zawieszania usług, rozliczenia oraz przegląd izolacji tenantów. Backend FR1 ma zapis do Docker socket; `privileged=false` nie jest pełną granicą bezpieczeństwa wobec takiego uprawnienia. Obecne uprawnienia per serwer nie są dowodem izolacji wymaganej dla dowolnych niezaufanych klientów.

## Proponowane pierwsze trzy paczki prac

1. **Hardening:** nagłówki HTML i cookie, bounded login limiter, projekt odwoływalnych sesji/MFA. Każda zmiana z testem odpowiedniej granicy, bez mieszania z redesignem.
2. **Ochrona danych:** aktualizacja agentów, uruchomienie zaplanowanych kopii i retencji dla docelowych serwerów, potwierdzenie backupu panelu i próba odzyskania. Osobno uporządkowanie cache FR1.
3. **Panel operatora:** ostrzeżenia zgodności, podsumowanie backupów i alertów, skróty do przyczyny problemu. Potem moduł map/dodatków ReHLDS jako wyraźna korzyść użytkowa.

## Podstawa zaleceń bezpieczeństwa

- [OWASP HTML5 Security — przechowywanie identyfikatorów sesji](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [OWASP HTTP Headers — ochrona dokumentów i osadzania](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- Dokumentacja projektu: `BACKUP-PROTECTION.md`, `RELEASE-2.0.59.md`, `PERFORMANCE-PROGRESS.md`; historyczne wyniki są wyraźnie oddzielone od dzisiejszego sprawdzenia.
