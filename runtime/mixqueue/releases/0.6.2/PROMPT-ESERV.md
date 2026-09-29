# ESERV — nowe boty AI i testowe rundy 30 sekund

Nowa paczka `mixqueue2-eserv-0.6.2.zip` zastępuje do wdrożenia zestaw 0.6.1,
ale nie wolno nadpisywać starszych plików wydania. Jeśli 0.6.1 już pracuje,
aktualizację wykonaj dopiero po zakończeniu meczu, cleanup i zwolnieniu lease.

Wersje: **kontroler 0.6.2, agent 0.6.1, WWW minimum 0.7.2**.
Agent rzeczywiście się zmienia: cztery bezpieczne kody odrzucenia AI/NAV.
WWW 0.7.2 musi być przed nowym runtime; inaczej walidator nie zna tych kodów.
Protocol 2, adapter amxx, assignment_contract 3 i stats_version 2 pozostają.
Sprawdź załączony manifest i SHA256SUMS; źródła są w osobnym source.zip.

Zmiana gry: testy full_test i solo mają 30 s aktywnej rundy oraz prawdziwe
zBoty ReGameDLL poruszające się i walczące. Ranking nadal 105 s; freeze 10 s,
C4 35 s, /ready 300 s, kapitańskie pauzy 3 x 30 s, systemowe 1 x 90 s
na drużynę mają dotychczasowe zasady. Podłożona bomba działa normalnie.
Bot-kapitan nie głosuje /unpause. Testy pozostają bez ELO i kar.

W uniwersalnym instalatorze WAW1/WAW2 uwzględnij profile botów oraz NAV.
ReGameDLL 5.30.0.814 jest wystarczające. Wymagane `bot_enable "1"`
w `cstrike/game_init.cfg` oraz pełny restart pustego serwera. Szczegóły
scalania plików, pochodzenia zasobów i sprawdzania BSP/NAV są w INSTALL.pl.md.
Paczka ma oficjalne profile i przykładową nawigację Dust2 z przypisanym hashem
BSP. Nie zakładaj, że sama obecność BSP daje gotowość AI. Przygotuj NAV osobno
dla wszystkich faktycznie zainstalowanych map w testowej puli; nie analizuj
ich podczas aktywnego lease ani nie nadpisuj ręcznie edytowanych NAV.

Po restarcie sprawdź hash załadowanej biblioteki i świeży heartbeat wersji.
Odbiór zacznij od Dust2 w trybie 1+9: oba zespoły botów przemieszczają się,
kupują broń i walczą, nazwy/drużyny zgadzają się z WWW, /ready i trzy restarty
prowadzą do LIVE, licznik aktywnej rundy zaczyna od 0:30. Sprawdź prawdziwe
obrażenia/strzały/kille w wyniku oraz koniec testu z normalnym idle/release.
Następnie 2+8: kapitanowie, pauzy/freezetime i obustronne /unpause bez resetu.
Odbiór każdej kolejnej mapy obejmuje ruch botów i cele mapy.

CSCO nie podmieniało binarki aktywnego SRV-107. Laboratorium i testy GameDLL
nie oznaczają odbioru prawdziwego klienta Steam. Dokładne wyniki i ograniczenia
są w ACCEPTANCE.md. Nie włączaj publicznej puli.

Zachowaj konfigurację, klucze, server_id, broker isolation, RCON, spool/WAL,
journal, generacje, active-matchbot, original-hostname, original-bots.txt,
recovery, historię oraz pozostałe AMXX. Istniejące konflikty ograniczają się
do mq2_match.amxx i statsx.amxx. Nie resetuj danych w celu przeprowadzenia testu.
