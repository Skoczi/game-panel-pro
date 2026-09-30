# WWW 0.8.0 / MatchBot 0.6.7 / agent 0.6.3

Nowy wariant pełnego testu: dziesięć botów AI 5v5 bez gracza Steam. Administrator wybiera dostępną mapę (domyślnie Dust2) i MR12/MR15. Boty zgłaszają ready po 15 sekundach od udanego załadowania mapy, potem następują trzy restarty i mecz. Właściciel pozostaje poza składem i ma dostęp do testu/historii w WWW bez przypisywania mu wyniku, statystyk, ELO ani kar. Rundy testowe mają 30 sekund.

## Zakres i zgodność

Zmiana obejmuje formularz i lifecycle WWW, jawny bot-only tryb przypisania w agencie oraz parser/zegar gotowości kontrolera. Nowa funkcja wymaga 0.6.7 / 0.6.3 i capabilities `bot_only_test=true`, `bot_only_ready_seconds=15`; zwykłe testy i ranked zachowują swoje wcześniejsze wymagania. Protocol 2 i assignment_contract 3 pozostają; tryb nagłówka MQ2V3 ma wartość 3. Brak migracji schematu, zmian reguł publicznych kolejek, map i danych historycznych. Paczki są nowe i wersjonowane.

Zegar 15 sekund jest osobny od 300-sekundowego limitu bezpieczeństwa gotowości. Wymagana jest obecność dziesięciu przypisanych botów i poprawny profil reguł. Ładowanie mapy nie zużywa odliczania; cleanup, recovery i dezaktywacja zerują zegar. Standardowy test 1+9 dalej czeka na /ready człowieka.

## Sprawdzone

- 12 zestawów PHP / 74 wiersze PASS: rzeczywisty Application i TestMatches, MR12/MR15, autoryzacja administratora, typ flagi, mapa z inventory, kompatybilność przed rezerwacją, idempotencja tworzenia, 10 botów, owner bez claim/roster, normalne zakończenie, stop, błąd AI, timeout, cleanup i historia bez ELO/kar. Zdarzenia gry w tych testach są syntetyczne.
- 11 zestawów C++: parser trybu 3, odrzucenia starszych/przekłamanych kontraktów, zegar przed i po 15 sekundach, izolacja meczu/generacji, reset i dotychczasowe kontrakty/reguły/statystyki/obserwatorzy.
- 59 testów Python na Linux WSL, bez pominięć: serializacja 10 botów i właściciela, kompatybilność, stare 1+9, journal/spool, obserwatorzy. Agent nie generuje własnego loaded ani ready.
- Build produkcyjny Linux i386; eksport Metamod gotowej biblioteki potwierdza 0.6.7 oraz Skoczi / CSCO.gg, bez komend QA.
- Testy rendererów PL/EN, wybór Dust2 z puli, zachowanie wybranej mapy, brak map nieobecnych, blokada starych serwerów i neutralna historia właściciela. Kontrola wygenerowanych bundle i składni JS.
- Przegląd przez przeglądarkę na izolowanej lokalnej bazie: formularz, zmiana mapy, MR12, utworzenie testu i strona meczu z dziesięcioma botami. To dowód WWW, nie uruchomienia GameDLL.
- Przegląd źródeł dedykowanego ReHLDS/ReGameDLL oraz istniejących ustawień AI: brak wymogu obecności człowieka, `bot_join_after_player=0`, `bot_auto_vacate=0`, aktywne myślenie botów i fizyka. Wymagane sprawne profile i NAV dla wybranej mapy oraz minimum 10 slotów.

Dowody i logi: `var/implementation-067`. Dalsza kontrola paczek obejmuje CRC ZIP, wszystkie SHA256SUMS, historyczne pliki pobrań i eksportowaną wersję biblioteki.

## Jeszcze do odbioru

Nie wykonano autentycznego meczu 0+10 na GameDLL ani odbioru Steam w tej zmianie; istniejący lokalny runtime gry nie był dostępny. ESERV powinien wykonać kroki z PROMPT-ESERV.md po kontrolowanym wdrożeniu na pustym serwerze bez lease. Publiczna pula pozostaje wyłączona.

HLTV i zapis dem nie zostały wdrożone. Obecna kontrola wejścia odrzuca FL_PROXY; to osobny etap integracji. Nie osłabiano kontroli rosteru, dostępu obserwatorów ani recovery.
