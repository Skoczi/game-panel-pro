# MatchBot CSCO 0.5.2 — pauzy kapitanów i obrażenia po rundzie

Nowe wydanie kontrolera Linux i386. Agent pozostaje **0.5.1**, bez zmian
kodu ani protokołu. Wymagane WWW **>= 0.6.5**; CSCO działa już na 0.6.6.
Adapter `amxx`, protocol 2, assignment_contract 2, istniejące zdarzenia
`pause`/`resume` z pustym `data` pozostają zgodne. Nie ma migracji bazy WWW.

## Pauzy

- `/timeout` (także `/pause` i dawne wejścia menu) wymaga kapitana aktualnego,
  zweryfikowanego przypisania Steam. Drużyna i nazwa pochodzą z logicznej
  drużyny w kontrakcie, niezależnie od CT/T i zmiany stron.
- Dwa timeouty na drużynę, po 60 sekund od początku następnej rundy.
  Odrzucone żądanie, w tym podczas freeze time, nie zużywa limitu.
- `/unpause` wymaga zgody kapitanów **obu różnych drużyn**, w dowolnej
  kolejności. Pierwszy głos nie wznawia gry. Powtórzenie głosu nic nie zmienia.
  Obie pełne drużyny muszą być obecne. Właściciel testu ani administrator nie
  dostaje jednostronnego obejścia. Bot nie głosuje automatycznie.
- Zgody dotyczą bieżącego meczu/generacji/pauzy. Reconnect tego samego kapitana
  w tej samej pauzie zachowuje jego zgodę. Nowa pauza, półmetek, zakończenie,
  cleanup, zmiana mapy i recovery unieważniają zgody.
- Timer i drugi głos wywołują tę samą jednokrotną ścieżkę wznowienia: anulowanie
  timera, przywrócenie buytime i zwykłego freeze time, TAB/hostname LIVE oraz
  jedno `resume`. Nie ma restartu rundy, load, spawnu, teleportu ani zerowania
  wyposażenia, wyniku czy statystyk. Po wcześniejszym wznowieniu pozostaje
  zwykłe 10 sekund freeze time.
- Pauza reconnect, recovery i blokada brakującego składu nie mogą zostać
  zdjęte głosami. Naturalne wygaśnięcie pozostaje aktywne; po pauzie taktycznej
  brakujący zawodnik nadal uruchamia normalną procedurę reconnect.
- Prywatne komunikaty i HUD używają locale odbiorcy: PL świadomie w ASCII,
  EN po angielsku; nazwy drużyn są bezpiecznie ograniczane na granicy UTF-8.

## Obrażenia

CSCO, w tym testy solo i pełne, automatycznie wysyła prywatne podsumowanie po
każdej potwierdzonej rozegranej rundzie. Jeden wiersz na uczestnika, z którym
wymieniono obrażenia, obejmuje oba kierunki i liczbę trafień. Działa dla
żywego i martwego odbiorcy. Bez obrażeń pojawia się jeden krótki komunikat.

`[CSCO.GG] vs Neo | Zadane: 84 (3 trafienia) | Otrzymane: 27 (1 trafienie)`

`[CSCO.GG] vs Neo | Dealt: 84 (3 hits) | Taken: 27 (1 hit)`

Istniejąca macierz MatchRound jest teraz powiązana z pozycją Steam w podpisanym
składzie, nie ze zmiennym slotem silnika. Zapisuje zmierzony ubytek HP po
pancerzu, ograniczony do posiadanego HP; nie surowy flDamage ani overkill.
Ułamki sumowane są przed zaokrągleniem wyświetlanej wartości w górę.
Trafienie oznacza jedno wywołanie obrażeń z dodatnim ubytkiem HP, także dla HE.
Obrażenia drużynowe są oznaczone `[DRUZYNA]`/`[TEAM]`; świat, C4 i obrażenia
własne mają osobny wiersz bez przypisywania ich przypadkowemu graczowi.

Snapshot zamykany jest w następnej klatce silnika, po wyjściu z TakeDamage.
Dzięki temu obejmuje ostatnie trafienie kończące rundę, również ostatnią rundę
połowy i meczu. Epoka rundy i tożsamość przypisania odrzucają stare zapisy.
Wyjście jest porcjowane co 180 ms, maksymalnie jeden wiersz na odbiorcę na krok.
Nie zawiera HP przeciwnika. W trakcie otwartej rundy `/dmg` nie ujawnia danych,
także martwym graczom; po rundzie odczytuje dokładnie ten sam snapshot.
Ponowienie komendy jest ograniczone do 3 sekund; nie dubluje trwającego wydruku.

Nie ma podsumowań z rozgrzewki, trzech restartów startowych ani cleanup.
Zwykły koniec rundy poprzedzającej pauzę zachowuje własne podsumowanie.
Stary RoundEndStats nie drukuje drugiej tabeli w przypisaniu CSCO. Cvar
`mb_round_end_stats` pozostaje bez zmian dla samodzielnego upstream MatchBot;
CSCO włącza swój wydruk niezależnie od niego. StatsX pozostaje wyłączony zgodnie
z istniejącą listą konfliktów; pozostałe pluginy AMXX zostają.

## Instalacja i odbiór

Paczka zawiera wyłącznie produkcyjną binarkę, źródła GPL, manifest i sumy SHA-256.
Nie instaluje binarki QA ani nie nadpisuje starych archiwów 0.5.1.
ESERV wdraża kontroler dopiero na pustym SRV-107 bez aktywnego lease,
przez normalny instalator z kopią i kontrolowanym restartem. Agent 0.5.1
pozostaje identyczny. Zachowaj konfigurację, klucze, spool, journal, generację,
active-matchbot, original-hostname, recovery i całą historię.

Nie włączaj publicznej puli. Wyniki automatyczne oraz dokładne braki odbioru
opisuje ACCEPTANCE.md. Test encji GameDLL nie jest odbiorem Steam 2+8.
