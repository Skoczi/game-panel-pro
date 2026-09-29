# Instalacja CSCO MatchBot 0.6.1

WWW musi mieć >=0.7.1; agent >=0.6.0. Pakiet zawiera oryginalny agent 0.6.0.
Jeśli ESERV ma już tę wersję o podanym hashu, nie przebudowuj go bez potrzeby.

1. Zweryfikuj SHA256SUMS i manifest. Zrób backup aktualnych binarek i konfiguracji.
2. Potwierdź pusty serwer, brak lease i brak aktywnego przypisania/recovery.
3. W istniejącym kontrolowanym instalatorze zastąp wyłącznie kontroler i jego
   language.txt z tej paczki. Nie używaj binarki QA; nie kopiuj example.cfg
   nad lokalną konfigurację. Wykonaj zaplanowany restart pustego serwera.
4. Zachowaj podpisaną konfigurację, klucze, RCON, server_id, spool/WAL, journal,
   generation, active-matchbot, original-hostname, recovery i historię.
5. `mq2_status`: controller_version 0.6.1, protocol 2, assignment_contract 3,
   stats_version 2, ruleset 2, reconnect_budget 1, pause_policy 2,
   tactical_limit 3, tactical_seconds 30, ready_seconds 300.
6. Przeprowadź odbiór opisany w ACCEPTANCE.md. Publiczna pula pozostaje wyłączona.

Dotychczasowa lista konfliktów pozostaje: mq2_match.amxx i dokładnie statsx.amxx.
Nie wyłączaj całego AMXX ani pozostałych pluginów. StatsX przechwytuje /stats
i /score przed ReGameDLL_InternalCommand. Tytuł natywnej kolumny Score należy
do klienta; komendy MatchBot udostępniają K/D/A.

Pauza taktyczna: `/pause` lub `/timeout`, wyłącznie kapitan.
`/unpause`: zgoda obu ludzkich kapitanów; w 1+9 czekamy na naturalny timer.
Nie wprowadzono automatycznej zgody bota ani jednostronnego bypassu właściciela.
