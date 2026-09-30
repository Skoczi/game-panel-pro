# CS 1.6 — administratorzy i komentatorzy

Kontroler 0.6.5, agent 0.6.2, WWW 0.7.8. Funkcja dotyczy bezpośredniego wejścia
na serwer gry. HLTV i nagrywanie dem nie należą do tego wydania.

## Panel

Zarządzanie serwerami → Obserwatorzy. Uprawniony administrator matchmakingu
wybiera SteamID64 / STEAM_0:X:Y albo ID konta Flute z powiązanym Steam.
Nadanie ma rolę administratora (obserwacja) lub komentatora, zakres wybranego
meczu albo wszystkich meczów CS 1.6, czas ważności, opcję X-ray i powód.
Role oznaczają dostęp obserwatora; nie nadają RCON, kicków ani dowolnych komend.
Nie importujemy automatycznie wszystkich administratorów CMS.

Wpis meczowy ma pierwszeństwo przed globalnym tej samej osoby. Cofnięcie
meczowego wpisu odsłania nadal aktywny wpis globalny. Aby odebrać cały dostęp,
należy cofnąć oba. Historia nadań i cofnięć zostaje w bazie i audycie.

Uprawnienie jest związane ze SteamID zweryfikowanym przez serwer gry.
Nick, adres IP, sam link do meczu i deklaracja w czacie nie nadają dostępu.
SteamID należący do składu meczu zawsze pozostaje zawodnikiem, także po śmierci
lub rozłączeniu. Żadne nadanie admina nie pozwala mu wejść na spectator.

## Zachowanie gry

Obserwator wchodzi do spectator bez wyboru drużyny. Kamera może obserwować obie
drużyny. Obserwator nie jest dodawany do rosteru, statystyk, ELO, gotowości,
głosowań, limitów pauz ani kar. Jego rozłączenie nie uruchamia pauzy reconnect.
Komunikacja obserwatora nie trafia na czat/głos grających drużyn.
Serwer rezerwuje miejsca dla całego składu także podczas nieobecności gracza;
obserwatorzy korzystają tylko z dodatkowych slotów.

X-ray jest prywatną nakładką kolorowych znaczników kierunku/położenia żywych
zawodników. Nie jest obrysem modeli z CS2. Działa wyłącznie dla uprawnionego
obserwatora w obsługiwanym trybie kamery; można go przełączać komendą /xray.
Nie wymaga AMXX, modyfikacji klienta, sv_cheats ani wymuszania ustawień/bindów.
Geometria znaczników i kontrola odbiorcy mają testy automatyczne, ale wygląd,
wyrównanie i widoczność na stock Steam wymagają osobnego odbioru w grze.

## Aktualizacje podczas LIVE

WWW wystawia pełny snapshot `observer_update` dla konkretnego serwera,
match_id i generation. Pola payloadu: version=1, revision, expires_at oraz
observers[{steam_id,role,xray,expires_at,locale}]. Maksymalnie 16 tożsamości.
Ważność snapshotu to 300 s, odświeżenie co 60 s i natychmiast po zmianie wpisów.
Wygaśnięcie, odebranie dostępu, nowy mecz lub recovery zamyka dostęp.

Agent zapisuje niezmienny plik
`addons/amxmodx/configs/mq2/<id>-<generation>-observers-<revision>.txt`.
Nagłówek: `MQ2OBS1 <id> <generation> <revision> <expires_at>`.
Wiersz: `<SteamID64> <admin|commentator> <0|1 xray> <expires_at> <pl|en>`.
Następnie wywołuje wyłącznie
`mq2_observers <id> <generation> <revision>`.

Przyjęcie potwierdza świeży status kontrolera z observer_acl_version=1,
observer_revision i observer_expires_at. Agent dodaje observer_agent_version=1.
WWW wymaga obu wersji; samo powodzenie wymiany RCON nie potwierdza uprawnienia.
Odpowiedzi: observer_updated / observer_already_updated; błędy:
observer_invalid / observer_stale / observer_scope / observer_storage.
Starszy snapshot nie przywraca odebranych uprawnień. Błąd opcjonalnej aktualizacji
obserwatorów nie może zatrzymać abort/cleanup ani zmieniać stanu meczu.

Nie zmieniamy istniejącego przypisania, generacji, mapy ani wyniku. Nie używamy
ponownego load/restartu do aktualizacji dostępów. Dotychczasowy kanał ma HMAC
żądań agent→WWW i odpowiedzi WWW przez HTTPS; SHA-256 konfiguracji jest sumą
kontrolną, nie osobnym podpisem kryptograficznym snapshotu.

## Zasoby i odbiór

ESERV musi przewidzieć dodatkowe sloty: np. 12 dla 10 graczy + 2 obserwatorów.
Zmiana liczby slotów przy uruchamianiu serwera wymaga kontrolowanego restartu
pustej instancji. Nie zwiększaj limitu drużyn i nie wpuszczaj dowolnych widzów.
AMXX pozostaje niezależnym dodatkiem; nie kasuj jego katalogów ze stanem MQ2.
Pełna lista wykonanych testów i niepotwierdzonych przypadków: ACCEPTANCE.md.
