# CSCO MatchBot 0.6.2 — boty AI i krótsze rundy testowe

Kontroler 0.6.2, agent 0.6.1, WWW minimum 0.7.2. Są to nowe wydania;
nie zastępują plików 0.6.1/0.6.0/0.7.1 pod ich dotychczasowymi nazwami.

Testy pełne i solo otrzymują 30 sekund aktywnego czasu rundy. Ranking zachowuje
105 sekund. Warmup, freeze 10 s, C4 35 s, pauzy i limit /ready 300 s mają
dotychczasowe znaczenie. Podłożona bomba może przedłużyć rundę ponad 30 sekund.
Profil rundy i sprawdzanie jego zgodności używają tej samej reguły także w OT.

Nieruchomych przeciwników testowych zastępują natywne zBoty ReGameDLL.
Boty pełnego testu zachowują tożsamości z przydziału, nazwy, logiczne drużyny
i statystyki; solo używa jednego przeciwnika AI. Boty nie wchodzą do rankingu.
W 1+9 nadal nie ma jednostronnego /unpause: bot-kapitan nie głosuje,
więc pauza kończy się po zwykłym czasie. Testy nadal nie zmieniają ELO ani kar.

Potrzebne są bot_enable 1, oficjalne profile i NAV dla używanych map.
Nie uruchamiać analizy nawigacji podczas przypisanego meczu. Brak zasobów
ma czytelny kod odrzucenia w agencie i WWW, z istniejącym abort/idle release.
Podpisany kontrakt przydziału pozostaje v3, protocol 2, statystyki v2;
nowe są cztery dozwolone kody load_rejected, opisane w manifeście.

Zakres faktycznej weryfikacji i ograniczenia opisuje ACCEPTANCE.md.
Wdrożenie binarki gry oraz odbiór Steam wykonuje ESERV na pustym serwerze.
