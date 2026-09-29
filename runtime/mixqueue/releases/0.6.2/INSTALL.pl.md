# Instalacja 0.6.2 w ESERV

1. Potwierdź WWW >=0.7.2. Sprawdź manifest i SHA-256. Zrób backup plików,
   które zmieni istniejący instalator. Publiczna pula pozostaje wyłączona.
2. Poczekaj na pusty serwer, brak lease oraz zakończony cleanup. Nie przerywaj
   aktywnego przydziału ani recovery. Zainstaluj kontroler 0.6.2 i language.txt,
   a runtime agenta zaktualizuj do 0.6.1. Nie używaj binarki QA.
3. ReGameDLL 5.30.0.814 już obsługuje AI. Scal ustawienie bot_enable "1"
   w cstrike/game_init.cfg i wykonaj pełny kontrolowany restart. Nie nadpisuj
   całego game_init.cfg, server.cfg ani lokalnych konfiguracji pluginów.
4. W paczce ESERV resources/bot_profiles-5.30.0.814.zip jest niezmienionym archiwum
   oficjalnego repozytorium. Rozpakuj jego cstrike/ do odpowiadającego cstrike/:
   BotProfile.db, BotChatter.db i sound/radio/bot/. Zachowaj istniejące pliki
   w backupie, nagłówki autorów oraz pliki pochodzenia zasobów. Przy instalacji
   z samego ZIP kontrolera pobierz tę samą zależność z URL w dependencies.json
   i sprawdź jej SHA-256 przed rozpakowaniem.
5. Każda mapa dostępna w testach AI musi mieć zgodny maps/<map>.nav. Analizę
   bot_nav_analyze wykonuj wcześniej, na odizolowanej kopii bez przypisania
   i bez aktywnego MatchBot. Po zakończeniu sprawdź ruch/cele i parę hashów BSP/NAV.
   Nie uruchamiaj analizy w środku testu. Nie nadpisuj ręcznie edytowanych NAV.
6. Dołączona do paczki ESERV nawigacja de_dust2 pasuje tylko do BSP o SHA-256
   15945389528d113562ede0a2c80647ebfa799079ed1c05a25379bcf84e4e9286.
   Sprawdź navigation/nav-proof.json przed ewentualnym użyciem. Samą nazwą
   mapy nie wolno uzasadniać podmiany NAV. Pozostałe mapy przygotuj oddzielnie.
7. Uruchom `python3 scripts/check-cs16-bot-navigation.py --root /sciezka/cstrike de_dust2`
   z pełną listą map skonfigurowanych w testowej puli zamiast samego de_dust2. Narzędzie jest tylko
   odczytem: raportuje nagłówki oraz SHA-256, nie zastępuje odbioru gry.
   W samym archiwum źródeł skrypt jest w bin/check-cs16-bot-navigation.py.
8. Sprawdź świeży heartbeat i hash faktycznie załadowanej biblioteki,
   następnie odbiór z ACCEPTANCE.md. Nie włączaj publicznych kolejek.

Zachowaj klucze, identyfikatory, spool/WAL, journal, generację, active-matchbot,
original-hostname, original-bots.txt, recovery i historię. original-bots.txt
to stan odzyskiwania kontrolera — nie usuwać go ręcznie.
Po cleanup liczba botów wraca do zera, a bot_deathmatch do turniejowego zera;
pozostałe nadpisane ustawienia AI wracają do zapisanych wartości.
Lista konfliktów pozostaje mq2_match.amxx i dokładnie statsx.amxx; pozostałe
AMXX pozostają. Przykładowe cfg w paczce nie zastępują konfiguracji serwera.
