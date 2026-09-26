# Wdrożenie audytu eserv.pl

Autoryzacja użytkownika 26.09.2026: realizować P1/P2 i sześć kierunków rozwoju po kolei, po każdym zadaniu krótka notka i kontynuacja. Serwer testowy można zatrzymywać; przywracać stan po testach. Dokument śledzi stan faktyczny.

| Zadanie | Stan |
|---|---|
| 1. Nagłówki HTML i usunięcie cookie z tokenem | Wdrożone FR1: 1e2a36c, build + 2 testy UI + smoke nginx/root/SPA/404 + live OK; script CSP Report-Only |
| 2. Odwoływalne sesje, bezpieczne uwierzytelnianie i MFA | Wdrożone FR1: 7bb0d24, 236 testów Linux + 5 UI + HTTP/WS acceptance + live login OK |
| 3. Ograniczone limitery logowania i API | Wdrożone FR1: 955baeb; testy limitów i HTTP/WS OK |
| 4. Agenty 2.0.59+, backupy, retencja i próba odzyskania | Wdrożone; odzyskanie gry z NFS i bazy panelu sprawdzone |
| 5. Miejsce FR1 i kontrola wzrostu cache | Wdrożone: odzysk 35,7 GB; codzienna kontrola cache |
| 6. Alerty i niezależny monitoring | Wdrożone FR1/WAW1/WAW2 a0f7e5c; Discord dostarczony, wszystkie kontrole OK |
| 7. Ekran Wymaga uwagi / zgodność agentów | Wdrożone 304a71e; gra, zadania, dysk, kopie i capabilities |
| 8. Konsola, backupy, formularze, dostępność/mobile | Wdrożone 5a4e293; 18 testów UI, 2 backend i live OK |
| 9. ReHLDS: mapy, rotacje, admini i dodatki z rollbackiem | Wdrożone abc0579 na FR1/WAW1/WAW2; instalacja i rollback na kopii gry OK |
| 10. Sekwencje utrzymaniowe z kontrolą wyników | Gotowe do wdrożenia; 250 testów Linux, test UI, prawdziwa sekwencja na kopii gry OK |
| 11. Klonowanie i migracja serwerów | Do wykonania |
| 12. API power i podpisane webhooki | Do wykonania |
| 13. Aktualna dokumentacja, regresja i porządkowanie modułów przy zmianach | Do wykonania |

Repo: `D:/Projects/Skoczi/game-panel-skoczi`, gałąź `codex/eserv-audit-implementation`. Managed worktree nie powstał: chat wskazuje katalog nadrzędny, który nie jest repozytorium. Zachowano raport audytu.

Zadanie 1: patch `20260926-security-1e2a36c`; rollback `/opt/gamepanel-pro/local-patches/20260926-security-1e2a36c/rollback`. Backend i pozostałe kontenery bez zmian. Publiczne nagłówki oraz zalogowana flota sprawdzone po wdrożeniu. Pierwsza próba builda z bare SHA została zatrzymana przed zmianą live; skrypt otrzymał lokalny tag bazowego obrazu. Nie wykonano jeszcze pełnego egzekwowania script-src ani przeniesienia tokenu z localStorage — to oddzielne kroki.

Zadanie 2: JWT 15 min tylko w pamięci, sesja 12 h w HttpOnly/Secure/SameSite=Strict cookie, odwołanie HTTP/WS/download oraz sesji urządzeń. TOTP i jednorazowe kody odzyskiwania; konfiguracja wymaga aktualnego hasła. 236/236 testów backendu przeszło w odizolowanym kontenerze Linux, 5 testów przeglądarkowych i oba buildy OK. Test rzeczywistego HTTP/WS obejmuje logout, CSRF, MFA/replay, zmianę hasła i wyłączenie konta. Wdrożenie wymusi ponowne logowanie. MFA wymaga samodzielnego włączenia przez właściciela konta.

Rollback zadania 2: `/opt/gamepanel-pro/local-patches/20260926-sessions-7bb0d24/rollback`. Kopia SQLite wykonana online i sprawdzona integrity_check. Baza nie jest automatycznie cofana; przed ręcznym rollbackiem po aktywacji MFA trzeba uwzględnić, że poprzedni kod nie egzekwował MFA.

Zadanie 3: logowanie ma maks. 10 tys. wpisów na mapę, usuwa wygasłe wpisy i rezerwuje próbę przed bcrypt. Domyślnie 10 prób/login i 100 prób/IP na 15 min, blokada 15 min; poprawne logowanie czyści tylko licznik loginu. API: 240 błędnych uwierzytelnień/min na źródło i niezależne 120/min/poprawny token. Źródło przez Express req.ip zgodnie z trust proxy; FR1 nadpisuje X-Forwarded-For w nginx, backend jest na localhost. Liczniki są lokalne dla procesu, resetują się przy restarcie. 4 testy związanych ścieżek + build OK.

Zadanie 4: oba agenty 2.0.59/32f7753; health i brak restartów innych kontenerów potwierdzone. WAW2 ma OVH NFS `/mnt/ovh-backup/gamepanel-backups`; kopie gry 7 lokalnych/14 zewnętrznych, backup codziennie 03:15 UTC (zadanie 4 w runtime 8). Pierwsza kopia zewnętrzna zakończona i sprawdzona SHA-256. Znaleziono i poprawiono odrzucanie 32-znakowych runtime ID w externalBackupStore; 4 testy Linux OK. Próba odtworzenia z OVH o 17:25:35 UTC: import ze sprawdzeniem sumy, produkcyjny restore, start izolowanego kontenera, A2S de_dust/0/16; źródłowy kontener i server.cfg bez zmian. Testowy kontener i dane po udanej próbie usunięte, raport pozostawiony w `/srv/gamepanel-agent/restore-tests`.

Doprecyzowanie użytkownika: QR dla iPhone wdrożony na FR1 (frontend 136b338). QR generowany lokalnie, otpauth link, login/issuer, ręczny klucz jako fallback. 5 testów UI i build OK; npm audit prod 0. Fizyczny iPhone nie był użyty do odbioru.

Backup control-plane: codziennie 03:00 UTC (+ do 120 s), systemd timer na WAW2; 14 ostatnich zweryfikowanych archiwów na host, katalog NFS `gamepanel-backups/control-plane`. Źródła FR1/WAW1/WAW2: SQLite backup API + integrity_check, compose/env/release, identity agentów, dokładne obrazy Docker; FR1 także nginx vhost. Klucz odbiorcy na WAW2 ograniczony na FR1/WAW1 przez from/restrict/forced command do eksportu kopii. Pierwsze 3 archiwa sprawdzone (125/78/78 MB). Próba odzyskania FR1: obrazy załadowane, kopia DB/konfiguracji, odszyfrowanie obu kluczy agentów i rzeczywiste logowanie HTTP do testowego konta wyłącznie w kopii — OK. Pełny bootstrap panelu wymaga Docker socket; test uruchamiał moduł auth bez Dockera i sieci, nie testował przełączenia publicznego ruchu ani połączenia odtworzonego panelu z prawdziwymi agentami. Certyfikaty TLS i pliki gier nie wchodzą do kopii control-plane; gra ma odrębny backup NFS.

Zadanie 5: FR1 odzyskał 35 693 494 272 B filesystemu przez prune nieużywanego build cache starszego niż 24 h (max-used-space 8GB, reserved-space 2GB). Obrazy, wolumeny i kontenery pozostały bez zmian; health OK. Timer `eserv-build-cache-gc.timer`: codziennie 04:30 UTC + do 5 min. Wspólna blokada z wdrożeniami; nie restartuje Dockera ani gier.

Zadanie 6: Discord przyjął test za pierwszą próbą. Niezależny monitor WAW1 sprawdza HTML/API co minutę, alarm po 3 błędach, recovery po 2 sukcesach; trwały stan zapobiega powtórzeniom. Sekret w /etc/eserv-availability-monitor.json (0600), poza repo. Kontrola operacyjna runtime: dysk 85%/95% lub poniżej 8/2 GiB, backupy 36/72 h, brak kopii krytyczny; kontrola lokalnych/zewnętrznych kopii, harmonogramu i pokwitowań backupów FR1/WAW1/WAW2. Stan i przejścia trwałe w SQLite. 242/242 testy Linux, oba buildy oraz test stanów monitora OK.

Zadanie 7: status gry i ostatnich zadań bez dublowania już istniejących alertów. Widok root agreguje dane węzłów, pokazuje brakujące capabilities i dokładne buildy, linki do właściwego serwera przez trwały numer SRV. Testy 390/1280px, 13 testów backendu, buildy i HTTP/WS acceptance OK; aktualizacja FR1/WAW1/WAW2 bez restartu gry.

Użytkownik dostarczył skrypt instalacji Red-Banana-Official/cstrike1.6_rehlds: ReHLDS, AMXX, ReGameDLL_CS, ReAPI, Metamod-R, Reunion. Katalog ma zawierać te opcje; nie wykonywać skryptu 1:1 (latest, chmod 777, brak rollbacku). Repo zawiera też ReVoice Plus, którego w dostarczonym skrypcie nie ma.

Zadanie 9: katalog sześciu modułów ze skryptu użytkownika, oficjalne przypięte wydania z SHA-256 i zależnościami. Mapy/rotacja, administratorzy Steam ID, lista pluginów AMXX, obowiązkowe snapshoty zmian i kontrola wersji. Instalacja w zatrzymanym serwerze po zweryfikowanej kopii, journaled staging/swap, zachowanie konfiguracji i soli Reunion. Próba WAW2 2026-09-26 18:39:16 UTC: sześć modułów, start/A2S, przywrócenie oryginalnego archiwum i ponowny start/A2S; źródłowy kontener i CFG bez zmian. 246/246 testów Linux, 13/13 UI, oba buildy OK. Szczegóły: REHLDS-ADDONS.md.

Zadanie 10: opcjonalna komenda zapisu, stop, zweryfikowana kopia offline, opcjonalny istniejący native update, start i A2S healthcheck. Ostatni wynik każdego kroku w SQLite, blokada mutacji przez całą sekwencję, przerwanie/błąd wyłącza harmonogram, brak automatycznego replay. 250/250 testów Linux i test formularza mobilnego OK; oba buildy OK. Próba WAW2 18:55:26 UTC przez rzeczywisty scheduler na odizolowanej kopii: stop/backup/start/query success, źródło bez zmian. Aktualizator Steam nie był uruchamiany w próbie; gałąź update i błędy sprawdzone testami z podstawionymi zależnościami. Szczegóły MAINTENANCE-WORKFLOWS.md.
