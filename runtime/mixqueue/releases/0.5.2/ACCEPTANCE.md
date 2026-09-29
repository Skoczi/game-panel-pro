# MatchBot CSCO 0.5.2 — zakres weryfikacji

Data: 2026-09-29. Kontroler Linux i386; agent zachowany 0.5.1.
Wymagany próg WWW: 0.6.5, aktualne WWW: 0.6.6.

Produkcja `matchbot_csco_mm.so`:
`ae8cf6516f4a684d44bff8e21f0a590b1de1988351557450bc76efdfe6d1e82d`.

Niezmieniony `mq_agent.py`:
`586a831b8605bc419c40aa9c112ab59c614f1e06a48ec37514e394a40e4efc3a`.

## Automatyczne testy logiki

- `cs16_feedback_test.cpp`, C++11, również AddressSanitizer/UBSan: oba
  porządki głosowania, niekapitan, zła drużyna, inny mecz/generacja, duplikaty,
  brak aktywnej pauzy, reset epoki zgód; pomiar HP, pancerz/overkill, wartości
  niefinitywne, końcowe trafienie dodane po zagnieżdżonym RoundEnd, jednokrotne
  zamknięcie snapshotu, stary token rundy, nowa tożsamość, brak obrażeń,
  oba kierunki/wiele celów, świat/self/team, formy trafień PL/EN, UTF-8 i format.
- `cs16_contract_test.cpp`: dotychczasowe v1/v2, Steam, właściciel testu,
  boty tylko testowe, nazwy, mapy, MR i OT.
- `python -m unittest discover -s tests -p 'test_agent*.py'`: **27/27 PASS**.
  Żaden plik agenta nie został zmieniony.
- Kompilacja QA i produkcji; w binarce produkcji nie ma komendy `mq2_qa`.
  Pozostają istniejące ostrzeżenia kompilatora w kodzie upstream/SDK.

## Izolowany ReHLDS/ReGameDLL — encje QA

Środowisko `/opt/csco-lab/matchbot-052`, kontener `--network none`, RCON tylko
w jego przestrzeni loopback. Oddzielna kopia wcześniejszego laboratorium,
nowe generacje, zachowany dziennik, wyłącznie normalny cleanup. **To nie są
prawdziwe klienty Steam ani odbiór 2+8.**

Silnik: ReHLDS 3.15.0.896, ReGameDLL 5.30.0.814, Metamod-r 1.3.0.149.
Skrypt: `tests/cs16_feedback_runtime.py`, mapa de_dust2.

| Scenariusz | Przypisanie / generacja | Potwierdzony zakres |
|---|---|---|
| full | `7e57000018d9c38e315e3764` / 53 | Dwie encje zastępujące ludzi i osiem botów; 3 restarty; pełne rundy do 16:1; zmiana stron; nazwy logiczne; prywatne teksty PL/EN; pancerz, HE, C4, świat, friendly/self; automatyczny odczyt zgodny z ręcznym; brak ujawnienia podczas rundy; kapitan/niekapitan; dawne wejścia menu i głosowania; quota; oba porządki zgód; duplikaty; reconnect kapitana; jednorazowe resume w obu kolejnościach wyścigu timer/głos; stan drugiego kapitana, wyposażenie, pozycja, buytime i wynik zachowane; statystyki końcowe i cleanup |
| ranked | `0520000018d9c3d095068c9f` / 54 | Cztery encje QA, brak drugiego gracza blokuje wcześniejsze wznowienie; pauza reconnect nie przyjmuje zgód; naturalna ścieżka timera po przyspieszeniu zegara; powrót; nieoczekiwany reset wchodzi w recovery, zeruje zgody i blokuje timer/głosy; bez dodatkowego resume; normalny cleanup bez zerowania generacji |
| damage | `0520000018d9c427a884030c` / 59 | Trafienie, rozłączenie dwóch uczestników, ponowne użycie ich slotów przez przeciwnych graczy i powrót, następne trafienia od innej tożsamości; właściwe nazwy w macierzy; ostatnie zabójstwo 500 raw daje 100 HP straty; prywatny komunikat braku obrażeń; identyczny manualny replay; brak starej/bieżącej tabeli po otwarciu kolejnej rundy |
| expiry | `7e57000018d9c3eba81da666` / 56 | Jedna encja zastępująca człowieka plus dziewięć botów; kapitan przeciwnej drużyny jest botem; tylko jedna zgoda; pełne rzeczywiste 60 sekund timera, **bez fast clock**; jedno resume, wynik 1:0 zachowany, zgody wyzerowane, normalny cleanup |

Weryfikacja prywatnych komunikatów korzysta z przechwycenia tekstu bezpośrednio
przed wysyłką przez SayText w kompilacji QA. Produkcja wysyła je do konkretnego
odbiorcy, nie do wszystkich. Faktyczny rendering HUD/chat/TAB oraz zachowanie
realnych pakietów klienta wymagają poniższego odbioru Steam.

## Produkcyjna binarka w laboratorium

`tests/cs16_052_release_smoke.py`: brak komend QA; istniejący prefiks CSCO.GG;
rozróżnienie braku pliku, błędnego przypisania i brakującej mapy bez fałszywego
loaded/zmiany generacji; prawdziwa lista BSP; idempotentny load; dziewięć botów
w warmup; finish_test zachowujący snapshot; cleanup/retry/idle; hostname wraca;
stare przypisanie jest odrzucane. Osobny restart procesu aktywnego przypisania
wszedł w recovery, zachował generację i wymagał normalnego cleanup. Obie części
testu produkcyjnej binarki **PASS**; cleanup oraz jego ponowienie przywróciły
healthy/idle i oryginalny hostname, bez zerowania high-water mark.

## Odbiór, którego nie wykonano

- Steam 0.5.2: 2+8 z dwoma ludzkimi kapitanami, zwykły gracz bez uprawnień,
  rzeczywisty HUD/chat w PL i EN, TAB PAUSED→LIVE, reconnect podczas pauzy,
  niezmieniony wynik/ekwipunek oraz widoczny automatyczny wydruk końca rundy.
- Dziesięciu prawdziwych klientów, wszystkie możliwe awarie I/O, odmowy i
  warianty wygasania/recovery. Nie zastępuj ich testami encji.
- Nie ustalono przyczyny wcześniejszego crasha klienta Steam.

Wcześniejszy odbiór **0.5.1** pochodzi z przekazania ESERV: jeden prawdziwy
gracz potwierdził TAB WARMUP→LIVE oraz zachowanie drużyny i wyniku po reconnect.
Ostatnia wskazana sesja `7e5700a014f73f118b9773b4` / generacja 12 miała LIVE 6:0
i aktywny lease. Nie jest to dowód jej późniejszego zakończenia lub zwolnienia.

Nie wdrażano nowej binarki na SRV-107 ani innych aktywnych serwerach gry,
nie zmieniano WWW/agenta, nie włączano publicznych kolejek. Zachowano poprzednie
archiwa i ich sumy. Wstępny harness QA zadający obrażenia świata przez null
zamiast encji świata zakończył proces laboratorium; helper został poprawiony,
następne przypadki przeszły. Nie wiąże to tej próby z dawnym crashem Steam.
