# Game Panel PRO — kod 2.0.59

Niezależny fork OVH Game Panel, rozwijany przez Skoczi. Zachowujemy oryginalne prawa autorskie OVH i licencję Apache 2.0. Projekt bazuje na OVHcloud Game Panel 1.5.0 i kontynuuje rozwój własnego forka.

Wydanie można zainstalować samodzielnie — bez wcześniejszej instalacji OVH Game Panel. Publikacja na GitHubie nie oznacza wdrożenia na eserv.pl ani WAW1.

[Nowa instalacja, migracja z 1.5.0 i rollback](INSTALL.md). Standardowa instalacja pozwala uruchamiać kolejne aktualizacje z panelu; wydania i changelog pochodzą wyłącznie z naszego GitHuba. Instalacje z agentami zdalnymi wymagają skoordynowanej aktualizacji.

## Najważniejsze zmiany

- Backup Native działa także przy uruchomionej grze. Kopia „live” nie gwarantuje spójności zapisu świata; dla spójnej kopii zatrzymaj grę.
- Archiwum trafia do `data/backups`, obok `serverfiles` i `log`, i zawiera wyłącznie `serverfiles`.
- Odtwarzanie wymaga zatrzymanego serwera. Najpierw sprawdzane i rozpakowywane jest archiwum, potem podmieniany katalog. Poprzednie pliki pozostają w `backups/recovery-<uuid>`.
- Edytor zapisuje bieżącą treść przez atomową podmianę pliku. Poprzednia zawartość trafia do historii.
- Cron odrzuca błędną składnię, pokazuje strefę czasu noda i kolejne wykonania.
- Metryki pokazują używane vCPU, RAM i przyznane limity; zajętość danych gry oraz wolne miejsce noda są rozdzielone.
- W panelu jest changelog zainstalowanej wersji oraz sprawdzanie stabilnych wydań istniejącego forka GitHuba. Brak wydania nie oznacza „panel aktualny”.

## Przed wdrożeniem

Lokalne wdrożenie eserv.pl z 26.09.2026 ma panel FR1 i agenty WAW1/WAW2 na zgodnym buildzie 2.0.59. Nowe funkcje wymagają capabilities odpowiedniego agenta; aktualizować wszystkie trzy komponenty razem. Szczegóły builda i odbioru: [stan wdrożenia](IMPLEMENTATION-ESERV-2026-09-26.md). Publikacja tego builda jako wydania GitHub nie była częścią prac.

Stare archiwa `.native-backups` nie są usuwane ani automatycznie konwertowane. Nowy format dotyczy układu `data/serverfiles`; inne stare układy wymagają jawnej migracji. Nie zmieniamy automatycznie danych istniejących gier.

[Obsługa i ograniczenia](OPERATIONS.md) · [wdrożenie i rollback](DEPLOYMENT.md) · [macierz funkcji](FEATURES.md) · [changelog](../../CHANGELOG.md) · [miejsce na screeny](../screenshots/README.md).

## Rozszerzenia eserv.pl — 26.09.2026

- [Sesje, MFA/QR, backupy i monitoring — instrukcja operatora](ESERV-RUNBOOK.md).
- [ReHLDS: mapy, admini, AMXX i katalog sześciu dodatków](REHLDS-ADDONS.md).
- [Sekwencje utrzymaniowe](MAINTENANCE-WORKFLOWS.md).
- [Klonowanie i transfer na inny węzeł](SERVER-CLONING.md).
- [API power i podpisane webhooki](API-POWER-WEBHOOKS.md), [OpenAPI](openapi-v1.json).
