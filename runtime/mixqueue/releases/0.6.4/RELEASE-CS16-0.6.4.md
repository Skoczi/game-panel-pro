# MatchBot 0.6.4 / WWW 0.7.6 — MR12 i statystyki po rundzie

CS 1.6 5v5 obsługuje MR12 i MR15. Wingman 2v2 pozostaje MR8. Dogrywki
pozostają MR3 (3 rundy na stronę, 4 wygrane w bloku; kolejna dogrywka przy remisie).
Przy MR12 zmiana stron następuje po 12 rundach, regulaminowy koniec od 13 wygranych,
a dogrywka przy 12:12. MR15 zachowuje 15/16/15:15, MR8 — 8/9/8:8.

Administrator wybiera format nowych meczów CS 1.6 5v5 w Panel → Kolejki.
Obecne ustawienie MR15 pozostaje domyślne. W pełnym teście format można wybrać
osobno. Ranking i kolejka pozostają wspólne. Zmiana nie modyfikuje istniejących
przypisań, gotowości, veto, wyników, ELO, historii ani włączenia kolejek.
Każdy mecz zachowuje podpisane zasady utworzenia, a oba sprawdzenia możliwości
serwera (rezerwacja i load) odrzucają MR12 na kontrolerze starszym niż 0.6.4.

Kontroler sprawdza dryf mb_play_rounds, mb_play_rounds_ot i mb_play_ot_mode.
Rozbieżność przechodzi przez bezpieczne recovery przed naliczeniem wyniku lub
zmianą fazy. Pozostałe guardy, generacje, journal i spool pozostają zachowane.
Profile czasu rundy, pauzy, 20 s przerwy oraz 180 s po meczu pozostają jak w 0.6.3.

Oś rund na stronie działa według formatu danego meczu. Kliknięcie rundy wyświetla
w tabeli statystyki narastająco do jej zakończenia. Runda 8 oznacza łączne dane
z rund 1–8; ostatnia runda i przycisk Cały mecz przywracają pełne podsumowanie.
W starszym momencie nie pokazujemy końcowego WIN/LOSS ani zmiany ELO.
Dostępne są też zakończone rundy meczu LIVE, bez danych z trwającej rundy.

Dane pochodzą wyłącznie z kompletnego zaakceptowanego snapshotu statystyk v2
tej rundy, serwera, meczu i generacji. Tożsamości mapujemy przez zamknięty skład.
Brak zapisanej rundy lub starsza telemetria oznacza jawny brak danych. Nie
interpolujemy końcowych wyników. Przykładowe mecze w trybie Test systemu korzystają
z oddzielnego, spójnego syntetycznego rejestru rund; rzeczywista historia nie jest zmieniana.

Agent pozostaje dokładnie 0.6.1. Protocol 2, adapter amxx, assignment_contract 3,
stats_version 2, ruleset 2 oraz istniejące zdarzenia pozostają bez zmian. WWW
0.7.6 nie wymaga nowej migracji schematu. Szczegóły sprawdzonych przypadków
w ACCEPTANCE.md. Odbiór prawdziwych klientów Steam jest oddzielny od automatyzacji.

Paczka jest nowym wydaniem. Wydania 0.6.3 i starsze są zachowane. ESERV wdraża
kontroler tylko po backupie, na pustym serwerze bez lease i aktywnego recovery.
Publiczne kolejki oraz kwalifikacja serwerów do puli pozostają wyłączone.
