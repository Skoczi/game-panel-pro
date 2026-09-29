# ESERV — kontrolowany odbiór MatchBot CSCO 0.5.2

Zaktualizuj uniwersalny instalator WAW1/WAW2 do nowej paczki kontrolera 0.5.2.
Nie nadpisuj wydania 0.5.1. **Agent pozostaje 0.5.1**:
`586a831b8605bc419c40aa9c112ab59c614f1e06a48ec37514e394a40e4efc3a`.
WWW wymagane >=0.6.5, obecnie CSCO 0.6.6. Nie ma zmiany API, dodatkowych komend
RCON ani nowych pól zdarzeń. Nie aktualizuj fikcyjnie numeru wersji agenta.

1. Sprawdź SHA256SUMS.txt, manifest i produkcyjną binarkę Linux i386.
   Zachowaj dotychczasowe wymagania ReHLDS/ReGameDLL/Metamod i izolację executora.
   Instalator może wymagać przebudowy obrazu, jeśli osadza paczkę; sam runtime
   agenta nie wymaga zmiany. W paczce jest identyczne archiwum agenta 0.5.1.
2. **Sprawdź aktualny stan SRV-107 oraz lease w WWW przed restartem.** Ostatnie
   przekazanie 0.5.1 mówiło o LIVE 6:0, aktywnym lease w teście
   `7e5700a014f73f118b9773b4`, generacja 12, de_nuke. Nie jest to potwierdzenie
   zakończenia. Nie kończ sesji ani nie resetuj stanu tylko dla instalacji.
   Instaluj wyłącznie po normalnym zakończeniu/cleanup i zweryfikowanym idle,
   bez ludzi oraz bez rezerwacji. Zrób kopię przez zwykły przeglądany instalator.
3. Zachowaj server_id, klucze, RCON, broker, supervisor, spool.sqlite,
   events.jsonl, generation-matchbot.txt, active-matchbot.txt, original-hostname.txt
   i recovery. Nie kasuj historii ani nie odtwarzaj starego spool nad nowymi
   zdarzeniami. Nadal stosuj agent.dispatch oraz zweryfikowaną map_inventory.
4. Zachowaj dokładne dotychczasowe konflikty, w tym mq2_match.amxx i statsx.amxx.
   Nie wyłączaj AMXX ani innych pluginów zbiorczo. ReGameDLL_InternalCommand jest
   za przechwyceniem AMXX; StatsX może zabrać /stats i /score.
5. Po restarcie: controller_version=0.5.2, agent_version=0.5.1,
   agent_protocol=2, assignment_contract=2; healthy/rules_ready/idle na pustym
   serwerze, prawdziwa lista BSP i brak publicznej kwalifikacji do kolejek.
6. Odbiór Steam **2+8** z dwoma ludzkimi kapitanami (PL oraz EN): zwykły zawodnik
   nie może wywołać timeout; oba kierunki głosowania /unpause; pierwszy głos
   nie wznawia; duplikat nie zastępuje przeciwnika. Sprawdź nazwy WWW w HUD/chat
   przed i po zmianie stron, TAB PAUSED→LIVE, wynik, wyposażenie, pozycje i staty.
   Sprawdź naturalne wygaśnięcie, reconnect kapitana w tej samej pauzie, odrzucenie
   głosów podczas reconnect/recovery i brak przeniesienia zgód na następny timeout.
   W 1+9 kapitan-bot nie głosuje, więc pauza zwyczajnie wygasa.
7. Po końcu rundy bez /dmg ma przyjść prywatny wydruk dealt/taken z nickami i
   trafieniami, również martwemu graczowi. Potem /dmg ma zwrócić te same dane.
   Sprawdź PLASCII i EN, pancerz, ostatnie zabójstwo, koniec połowy/meczu, brak
   obrażeń i brak podglądu podczas rundy. Nie przywracaj StatsX do tego testu.
8. Zakończ przez normalne /endtest lub WWW, potwierdź snapshot, idle, zwolniony
   lease oraz brak ELO/kar w teście. Podaj identyfikatory i generacje, hash
   binarki/agenta, realne obserwacje klientów oraz pozostałe braki odbioru.

Nie traktuj testu encji GameDLL jako odbioru 2+8 ani dziesięciu klientów Steam.
0.5.1 miało potwierdzone TAB WARMUP→LIVE i reconnect z zachowaniem wyniku na
jednym prawdziwym kliencie. Przyczyna wcześniejszego crasha klienta nadal jest
nieustalona. Publiczne kolejki pozostają wyłączone. Rollback tylko na pustym
serwerze, przez przywrócenie binarki 0.5.1 z zachowaniem nowszego stanu trwałego.
