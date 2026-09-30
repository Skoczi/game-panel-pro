# Odbiór 0.6.5 — obserwatorzy CS 1.6

Kontroler 0.6.5, agent 0.6.2, WWW 0.7.8. Nowy pakiet ESERV; wydania
0.6.4 i wcześniejsze pozostają bez zmian. Biblioteki nie wdrażano na aktywny
SRV-107. HLTV i demka są poza zakresem.

## Automatyczna weryfikacja

Raport `evidence/release-proof.json` zawiera dokładne hashe binarki i agenta,
listę dowodów z SHA-256 oraz podsumowanie odbioru. Wyniki laboratoryjne dotyczą
odizolowanej instancji ReGameDLL z encjami QA, a nie klientów Steam.

- Walidacja ACL: SteamID, zakres meczu/generacji, rola, locale, liczba wpisów,
  ważność, rewizje, duplikaty i idempotencja. Test C++11 oraz ASan/UBSan.
- Projekcja prywatnych znaczników, kierunki kamery i granice GoldSrc WRITE_COORD.
- Agent: walidacja payloadu, niezmienny zapis, odmowa starej rewizji,
  wymagane potwierdzenie aktualnego statusu, odrzucenie błędnego RCON reply,
  błąd observer_update nie zatrzymuje późniejszego abort/cleanup.
- WWW: admin + CSRF, powiązanie konta Flute ze Steam, zakres meczowy/globalny,
  pierwszeństwo rosteru, nadanie/cofnięcie/wygaśnięcie, scope/generacja,
  stare capability, brak slotów, recovery i priorytet normalnego cleanup.
- Interfejs: utrata autoryzacji usuwa dane prywatne, błąd transportu usuwa
  connect, czas dostępu wygasa w przeglądarce, zawodnik zachowuje swój widok.
- Lokalny podgląd PL/EN oraz mobilny: dodanie przez konto Flute i cofnięcie
  wpisu, oczekiwanie na ACK, gotowy dostęp, stary kontroler i brak uprawnień.
  Dane oraz ACK kontrolera w tym podglądzie są jawnie syntetyczne.

## Potwierdzone na izolowanym serwerze gry

Sieć kontenera laboratoryjnego `none`, RCON tylko na loopback. Próba QA
generacja 120: LO3, rzeczywiste zakończenie rundy 1:0, następnie:

- Wejście admina i komentatora do spectator, z kamerą obu drużyn. Odmowa
  zmiany drużyny/gotowości/czatu; X-ray tylko przy osobnym uprawnieniu.
- Admin należący do rosteru zachowuje stronę i ograniczoną kamerę gracza.
- Wyjście/powrót obserwatora nie zmienia wyniku 1:0, zdarzeń obecności rosteru
  ani pauzy reconnect. Powrót nie odziedzicza przełącznika X-ray po starym slocie.
- Pusta nowa rewizja usuwa obserwatorów; stara rewizja nie przywraca dostępu.
- Rzeczywiste wygaśnięcie krótkiej, 7-sekundowej ACL zamyka dostęp.
- Obserwatorzy nie trafiają do payloadów statystyk, gotowości ani kar.
- Recovery zeruje dostęp i odrzuca aktualizację. Normalny cleanup kończy w
  idle/healthy, zachowując generację oraz wcześniejszy journal.

Osobny smoke produkcyjnej biblioteki 0.6.5 potwierdził zmapowany inode/hash,
Metamod RUN 0.6.5, branding, brak polecenia QA i odmowę ACL spoza meczu.
Po testach lab został zatrzymany i przywrócono jego poprzednią bibliotekę
0.6.4; zachowano generację 120 i cały journal. Dwie wcześniejsze przerwane
próby wynikały z harness: znak `/` niedozwolony w RCON oraz snapshot wymagany
przed cleanup. Poprawiono test; stan usunięto wyłącznie normalnym cleanup.

## Granice potwierdzenia

Nie ukończono odbioru na prawdziwych klientach Steam. W szczególności nie
potwierdzono jeszcze wyglądu/położenia znaczników X-ray w ruchu i obu kamerach,
realnego logowania obserwatora przez Steam, wieloklientowej transmisji głosu
ani pełnej próby 10 graczy + obserwatorzy z reconnect przy zajętych slotach.
Testy hooków GameDLL nie zastępują tych prób.

X-ray oznacza prywatne kolorowe znaczniki w kamerze IN_EYE/ROAMING. Nie jest
obrysem modeli CS2. Zgoda jest osobna, przełącznik domyślnie wyłączony i po
reconnect pozostaje wyłączony. Admin ze składu nie otrzymuje go nigdy.

Role administrator/komentator oznaczają prawo obserwowania; nie dodają
dowolnych komend zarządzania rozgrywką. Automatyczne dziedziczenie wszystkich
administratorów Flute nie jest włączone. Uprawnienie nadaje się jawnie
w panelu — ręcznym SteamID albo wskazaniem konta Flute.

ESERV wykonuje próby z `PROMPT-ESERV.md` dopiero po kontrolowanej instalacji
na pustej instancji bez lease. Nie włączać publicznej puli podczas odbioru.
