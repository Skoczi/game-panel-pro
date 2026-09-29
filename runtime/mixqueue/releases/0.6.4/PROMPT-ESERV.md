# Przekazanie ESERV — MatchBot 0.6.4

Nowe wydanie kontrolera dla CS 1.6: 5v5 MR12/MR15, Wingman MR8, dogrywki MR3.
WWW wymaga wersji **0.7.6**. Agent pozostaje **0.6.1** bez żadnych zmian API lub kodu.
Weryfikuj SHA256SUMS.txt i manifest.json. Nie nadpisuj poprzednich paczek.

Agent mq_agent.py SHA-256:
`2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a`.
Oryginalny agent ZIP SHA-256:
`f8d80c3e7deb4fe2608ac7e536d226f8bc8caa0f88728472659949c6272c432f`.
Nie podnoś fikcyjnie wersji agenta. Bibliotekę produkcyjną identyfikuje manifest;
binarki QA nie wolno instalować na SRV-107.

WAW1/WAW2: zaktualizuj instalator uniwersalny i weryfikowane hashe kontrolera.
SRV-107: sprawdź pusty serwer, brak lease, zakończenie cleanup i brak recovery;
wykonaj backup oraz kontrolowany restart. Zachowaj ustawienia, klucze, server_id,
broker isolation, RCON, spool/WAL, journal, generację, active-matchbot,
original-hostname, original-bots.txt i historię. Pozostaw inne pluginy AMXX,
z dotychczasową listą konfliktów mq2_match.amxx i statsx.amxx.

MR12 jest blokowane przez WWW do świeżego potwierdzenia kontrolera >=0.6.4.
MR15 pozostaje domyślne; administrator może zmienić format nowych meczów.
Pełny test ma osobny wybór MR12/MR15. Nie włączaj publicznych kolejek/puli.
Dotychczasowe mecze zachowują format; nie przepisuj ich konfiguracji ani historii.

Odbiór Steam po wdrożeniu:

1. MR12 5v5: podpisane przypisanie mr=12, zmiana stron po 12 rundach,
   20 s przerwy, wygrana 13:x albo 12:12 i zapowiedziana dogrywka MR3.
2. Przy remisie pierwszej dogrywki 15:15 następna ma znów 3 rundy na stronę.
   Potwierdź wynik, ekwipunek, statystyki, stronę po reconnect i TAB.
3. MR15 5v5 oraz MR8 2v2: właściwe granice połówek i zakończenie;
   pauzy kapitanów /freezetime oraz przerwy bez resetu wyniku.
4. Strona LIVE: po zakończeniu rundy kliknij wcześniejszą rundę; K/D/A, ADR,
   HS% oraz wynik w tabeli mają odpowiadać tej rundzie. Ostatnia przywraca całość.
   PL/EN, brak ujawniania niezamkniętej rundy, brak końcowego ELO przy wcześniejszej.
5. Naturalny koniec: wynik natychmiast zapisany, 180 s na gg/screeny, dopiero
   cleanup + idle zwalnia lease. Ręczny koniec testu nadal kończy od razu.

Automatyczny runtime używa odizolowanej GameDLL oraz encji testowych. Nie
zastępuje testu Steam 2+8 z dwoma kapitanami, dziesięciu klientów ani wszystkich
przypadków reconnect/recovery. Dokładny zrealizowany zakres w ACCEPTANCE.md.
