# Wdrożenie audytu eserv.pl

Autoryzacja użytkownika 26.09.2026: realizować P1/P2 i sześć kierunków rozwoju po kolei, po każdym zadaniu krótka notka i kontynuacja. Serwer testowy można zatrzymywać; przywracać stan po testach. Dokument śledzi stan faktyczny.

| Zadanie | Stan |
|---|---|
| 1. Nagłówki HTML i usunięcie cookie z tokenem | Wdrożone FR1: 1e2a36c, build + 2 testy UI + smoke nginx/root/SPA/404 + live OK; script CSP Report-Only |
| 2. Odwoływalne sesje, bezpieczne uwierzytelnianie i MFA | Wdrożone FR1: 7bb0d24, 236 testów Linux + 5 UI + HTTP/WS acceptance + live login OK |
| 3. Ograniczone limitery logowania i API | W toku |
| 4. Agenty 2.0.59+, backupy, retencja i próba odzyskania | Do wykonania; miejsce zewnętrzne do ustalenia na podstawie infrastruktury |
| 5. Miejsce FR1 i kontrola wzrostu cache | Do wykonania |
| 6. Alerty i niezależny monitoring | Do wykonania; odbiorca do potwierdzenia jeśli brak wcześniejszego ustalenia |
| 7. Ekran Wymaga uwagi / zgodność agentów | Do wykonania |
| 8. Konsola, backupy, formularze, dostępność/mobile | Do wykonania |
| 9. ReHLDS: mapy, rotacje, admini i dodatki z rollbackiem | Do wykonania |
| 10. Sekwencje utrzymaniowe z kontrolą wyników | Do wykonania |
| 11. Klonowanie i migracja serwerów | Do wykonania |
| 12. API power i podpisane webhooki | Do wykonania |
| 13. Aktualna dokumentacja, regresja i porządkowanie modułów przy zmianach | Do wykonania |

Repo: `D:/Projects/Skoczi/game-panel-skoczi`, gałąź `codex/eserv-audit-implementation`. Managed worktree nie powstał: chat wskazuje katalog nadrzędny, który nie jest repozytorium. Zachowano raport audytu.

Zadanie 1: patch `20260926-security-1e2a36c`; rollback `/opt/gamepanel-pro/local-patches/20260926-security-1e2a36c/rollback`. Backend i pozostałe kontenery bez zmian. Publiczne nagłówki oraz zalogowana flota sprawdzone po wdrożeniu. Pierwsza próba builda z bare SHA została zatrzymana przed zmianą live; skrypt otrzymał lokalny tag bazowego obrazu. Nie wykonano jeszcze pełnego egzekwowania script-src ani przeniesienia tokenu z localStorage — to oddzielne kroki.

Zadanie 2: JWT 15 min tylko w pamięci, sesja 12 h w HttpOnly/Secure/SameSite=Strict cookie, odwołanie HTTP/WS/download oraz sesji urządzeń. TOTP i jednorazowe kody odzyskiwania; konfiguracja wymaga aktualnego hasła. 236/236 testów backendu przeszło w odizolowanym kontenerze Linux, 5 testów przeglądarkowych i oba buildy OK. Test rzeczywistego HTTP/WS obejmuje logout, CSRF, MFA/replay, zmianę hasła i wyłączenie konta. Wdrożenie wymusi ponowne logowanie. MFA wymaga samodzielnego włączenia przez właściciela konta.

Rollback zadania 2: `/opt/gamepanel-pro/local-patches/20260926-sessions-7bb0d24/rollback`. Kopia SQLite wykonana online i sprawdzona integrity_check. Baza nie jest automatycznie cofana; przed ręcznym rollbackiem po aktywacji MFA trzeba uwzględnić, że poprzedni kod nie egzekwował MFA.

Zadanie 3: logowanie ma maks. 10 tys. wpisów na mapę, usuwa wygasłe wpisy i rezerwuje próbę przed bcrypt. Domyślnie 10 prób/login i 100 prób/IP na 15 min, blokada 15 min; poprawne logowanie czyści tylko licznik loginu. API: 240 błędnych uwierzytelnień/min na źródło i niezależne 120/min/poprawny token. Źródło przez Express req.ip zgodnie z trust proxy; FR1 nadpisuje X-Forwarded-For w nginx, backend jest na localhost. Liczniki są lokalne dla procesu, resetują się przy restarcie. 4 testy związanych ścieżek + build OK.
