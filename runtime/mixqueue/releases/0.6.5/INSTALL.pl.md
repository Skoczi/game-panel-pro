# Agent CSCO 0.6.2

Ta wersja faktycznie zmienia agenta: obsługuje observer_update oraz
observer_agent_version=1. Wymaga kontrolera MatchBot 0.6.5 i WWW 0.7.8 dla
obserwatorów. Dotychczasowe load/finish_test/abort/cleanup zachowują kontrakt.
Adapter nadal ma nazwę amxx, agent_protocol=2, assignment_contract=3.

Zaktualizuj istniejący runtime/runner ESERV. Nie uruchamiaj drugiego agenta obok
obecnego, nie zastępuj brokera i nie osłabiaj jego izolacji. Korzystaj z
Agent.dispatch zamiast bezpośredniego adapter.execute: niepotwierdzona opcjonalna
aktualizacja obserwatorów nie powinna zatrzymywać obsługi cleanup.

Dodaj do ścisłej listy poleceń RCON wyłącznie:
`mq2_observers <24 małe znaki hex> <dodatnia generacja> <dodatnia rewizja>`.
Generacja i rewizja muszą być liczbami <= 2147483647; bez dowolnych argumentów.
Przekaż status observer_acl_version, observer_agent_version, observer_revision,
observer_expires_at, observer_slots, connected_observers i observer_xray.
Nowy plik ACL znajduje się w istniejącym katalogu configs/mq2; żadne nowe ścieżki
od użytkownika nie są dopuszczane. Nie podmieniaj plików wcześniejszych rewizji.

Zachowaj klucze, server_id, konfigurację, RCON, spool SQLite/WAL, journal,
generację i wszystkie pliki recovery. Nie zmieniaj istniejących paczek 0.6.1.
Potwierdzenie pochodzi ze statusu kontrolera, a nie z samego uruchomienia komendy.
