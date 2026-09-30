# ESERV — MatchBot 0.6.5, agent 0.6.2, WWW 0.7.8

Nowe wydanie dodaje jawne uprawnienia administratorów/komentatorów do wejścia
na spectator podczas meczu. Role nie nadają dowolnych komend administracyjnych.
X-ray to prywatne znaczniki, nie obrys modeli CS2. HLTV i demka są poza zakresem.
Wersja Metamoda i statusu pochodzi z jednego źródła; autor Skoczi / CSCO.gg,
adres https://csco.gg. Zachowano prawa i informacje o pochodzeniu upstream.

Sprawdź manifest.json i wszystkie SHA256SUMS.txt. Paczka jest nowa; nie
nadpisuj ani nie przepakowuj wydań 0.6.4 i starszych. Nie instaluj binarki QA.
Dokładny zakres potwierdzeń oraz brak odbioru Steam opisuje ACCEPTANCE.md.

1. Zaktualizuj uniwersalny instalator/runtime WAW1/WAW2. Agent jest nowy 0.6.2;
   musi przejść przez istniejący broker/executor bez drugiej usługi.
2. Dodaj ściśle walidowaną komendę `mq2_observers <id> <generation> <revision>`
   oraz typ polecenia observer_update. Schemat i statusy opisano w OBSERVERS.md
   i INSTALL.pl.md. Nie zezwalaj na dowolne RCON ani ścieżki plików.
3. Potwierdź WWW >=0.7.8 wraz z addytywną migracją tabel obserwatorów. Starsza
   WWW nie oferuje nadań. Starszy kontroler/agent nie odblokowuje przycisku wejścia.
4. Dla SRV-107 sprawdź pustą instancję, brak aktywnego lease, brak recovery oraz
   zakończenie cleanup. Wykonaj backup i kontrolowany restart. Nie zmieniaj gry
   podczas aktywnego meczu. Zapewnij sloty ponad pełny roster, np. 12 dla 5v5+2.
5. Zachowaj konfigurację, klucze, tożsamość, RCON, broker, spool/WAL, journal,
   generację, active-matchbot, original-hostname, original-bots, recovery i historię.
   Pozostaw inne AMXX; zachowaj dotychczasową listę konfliktów StatsX/mq2_match.
6. Nie włączaj publicznej puli/kolejek i nie twórz nadania admina automatycznie.

Odbiór Steam przed akceptacją funkcji:

- Dwóch ludzkich graczy/kont plus obserwator z osobnym zweryfikowanym SteamID.
  Nadanie i cofnięcie w panelu w trakcie LIVE bez load, restartu, zmiany wyniku.
- Obserwator admin/komentator trafia wyłącznie na spectator, widzi obie drużyny.
  Nie pojawia się w tabelach KDA/ELO, gotowości ani głosach kapitanów.
- Wyjście obserwatora nie uruchamia pauzy, kar, utraty lease ani zmiany wyniku.
- Admin będący w rosterze (także martwy/reconnect) nie uzyskuje spectatora,
  przeciwnej kamery ani /xray. Grant o tym samym SteamID nie omija blokady.
- /xray on/off: prywatne znaczniki w kamerze in-eye i roaming, kolory obu drużyn,
  prawidłowe położenie przy yaw/pitch oraz brak znaczników u zawodników.
  Oceń stock Steam wizualnie; obrysu modeli CS2 nie obiecano.
- Sprawdź PL/EN, wygasanie i odwołanie grantu, ponowny reconnect oraz reuse slotu.
  Po cofnięciu dostępu nakładka wygasa; observer zostaje usunięty.
- Chat/voice komentatora nie trafia do grających drużyn. Brak wpływu na ready,
  pauzy taktyczne, reconnect graczy, wyniki, statystyki i naturalne 180s po meczu.
- Przy pełnym limicie obserwatorów zawodnik ze składu nadal może wrócić.
  Nie zwiększaj liczby zawodników drużyny, aby zrobić miejsce obserwatorowi.
- Sprawdź nowy mecz/generację, recovery, restart, wygasłą rewizję i starszą
  aktualizację: żaden stary dostęp nie może zostać przeniesiony ani odtworzony.

Zespół CSCO nie wdrażał tej biblioteki na aktywnym serwerze gry.
