# Agent 0.6.3 — test 10 botów

Aktualizacja agenta jest wymagana razem z kontrolerem 0.6.7 dla wariantu Boty 5v5 w WWW 0.8.0. Zachowaj konfigurację, klucze, środowisko usługi, RCON oraz istniejącą bazę spool i WAL; podmień wyłącznie runtime zgodnie z instalatorem ESERV i zweryfikuj hash pliku z manifestu.

Agent używa nadal adaptera `amxx` i protokołu 2. Nowy tryb podpisanego przypisania jest zapisywany jako MQ2V3 mode 3. Pozostałe typy przypisań, journal i spool pozostają kompatybilne. RCON potwierdza zgłoszenie; journal kontrolera pozostaje źródłem zdarzeń loaded/ready/LIVE.

Szczegóły wdrożenia, wymagania nawigacji i odbioru zawiera PROMPT-ESERV.md. Nie czyść bazy ani historii i nie włączaj publicznych kolejek podczas aktualizacji.
