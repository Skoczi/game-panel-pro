# MixQueue2 — kontroler / agent 0.5.0, WWW 0.6.0

Nowy, rzeczywisty tryb pełnego meczu testowego CS 1.6: administrator tworzy lobby
na wybranym pustym serwerze, zaprasza konta Flute, wybiera drużyny i kapitanów,
dopełnia skład nieruchomymi botami i przechodzi ready check oraz veto.
Boty są prawdziwymi encjami silnika. Wynik i statystyki pochodzą z gry.

## Dostęp w WWW

Matchmaking → Panel → Pełny mecz testowy. Wybierz serwer → Utwórz lobby.
Zaproszony użytkownik przyjmuje zaproszenie w Matchmaking; nie dostaje praw admina.
Dopełnienie jest idempotentne; kolejny człowiek zastępuje bota przed ready check.
Po zablokowaniu rosteru żaden uczestnik nie może zmieniać drużyn ani kapitana.
Przy jednym człowieku kapitan BOT wykonuje wyłącznie swoją kolej veto.

Ready check WWW wymaga potwierdzenia człowieka. Po wejściu do gry człowiek wpisuje
/ready; start ma trzy restarty. Bot zgłasza ready dopiero po utworzeniu i poprawnym
przydziale w silniku. Boty nie chodzą, nie strzelają i nie otrzymują AI.

W lobby, wyniku i historii widnieje TEST / NO ELO. Historia ma osobny filtr Testy.
Administrator może zakończyć test w WWW, właściciel również przez /endtest.
Ręczny koniec zachowuje rzeczywisty częściowy wynik, bez udawanego zwycięzcy MR.
Usuwanie pojedyncze/zbiorcze wymaga potwierdzenia liczby i zakończonego testu
z potwierdzonym idle. Wdrożenie nie usuwa starej historii.

## Integracja i wersje

- WWW minimum 0.6.0; agent minimum 0.5.0 / podpisywanie protocol 2;
  natywny MatchBot CSCO minimum 0.5.0, assignment_contract=2, full_test=true.
- Adapter nadal amxx. Stare ranked/solo assignment v1 pozostają obsługiwane.
  Source/Get5 nadal używa mostu 0.4.0; pełne testy w tej wersji dotyczą CS 1.6.
- Agent zmienił kod: ESERV musi przebudować obraz executora i odtworzyć kontener.
  Sam restart istniejącego obrazu nie instaluje nowego agenta.
- Własne nazwy kapitanów, drużyn, język i status testu są częścią podpisanego
  przypisania. Dane nie są interpolowane do surowej komendy hostname RCON.
- Hostname pokazuje WARMUP/LIVE/PAUSED i nazwy drużyn. Oryginalna nazwa jest
  zapisywana trwale i wraca po cleanup, mapchange oraz wejściu w recovery.
- Prefix domyślny pozostaje [CSCO.GG]. Nie zdiagnozowano wcześniejszego crasha
  klienta Steam; wydanie nie deklaruje jego naprawy.

## Statystyki i bezpieczeństwo gry

K/D/A, damage, headshots i rounds są utrwalane dla rosteru. Asysta pochodzi
z pAssister ReGameDLL, a nie z domysłu WWW. Profil ustawia próg obrażeń 40;
przy standardowych 100 HP pojedynczy kandydat potrzebuje więcej niż 40 obrażeń.
ReGameDLL wybiera kwalifikującego się pomocnika według swoich reguł obrażeń lub
aktywnego oślepienia; rekord tożsamości musi zgadzać się z bieżącym połączeniem.
Nie ma dodanego przez nas arbitralnego okna czasowego obrażeń. Teamkill, suicide,
warmup/restart i powtórna wiadomość śmierci nie naliczają drugiej asysty.
Źródła: [ReGameDLL 5.30.0.814 — CheckAssistsToKill](https://github.com/rehlds/ReGameDLL_CS/blob/5.30.0.814/regamedll/dlls/multiplay_gamerules.cpp),
[domyślny próg](https://github.com/rehlds/ReGameDLL_CS/blob/5.30.0.814/regamedll/dlls/game.cpp).

WWW oraz /stats i /score pokazują K/D/A. Natywny TAB nadal ma kolumny klienta;
Score zawiera kills, ale nie obiecujemy przemianowania etykiety ani kolumny A.
Nie zmieniamy bibliotek, lokalizacji ani bindów klienta. /hp i /dmg są blokowane
w czasie trwającej rundy, również dla martwego gracza.

PL/EN pochodzi z ustawienia użytkownika Flute. Przed identyfikacją fallback EN.
Komunikaty kick/reject są statyczne, krótsze niż 128 bajtów; PL używa jawnego ASCII
na przewodzie GoldSrc. WWW zachowuje polskie znaki. Log zawiera kod przyczyny.
Odbiór dokładnego renderowania kick i TAB na Steam pozostaje po stronie ESERV.

## Dane i migracja

Migracja module/database/schema.sql jest addytywna: test_matches, test_bots,
test_invites, test_tombstones, player_preferences, match_labels oraz indeksy.
Normalny pipeline matches/events/stats zostaje wspólny. Autorytatywna tabela testów
wyklucza ELO, ranked wins/losses, kary i statystyki profilu rankingowego.

Tombstone przechowuje tylko match/server/generation/expiry przez 180 dni.
Po retencji zarezerwowana przestrzeń ID 7e5700 nadal pozwala ACK bez zapisu dla
bardzo starych eventów podpisanych przez uprawnionego agenta z historyczną generacją.
Nie odtwarza to statystyk i nie odblokowuje obcego lease. Zwykłe nieznane ranked ID
nadal są odrzucane. Audyt usunięcia zachowuje administratora, liczbę i IDs.

Po utracie agenta zachowywany jest ostatni potwierdzony snapshot; wynik oznacza
server_error. Lease pozostaje do potwierdzenia idle. Nie kasować markerów, journal,
spool ani generacji, aby wymusić zwolnienie. Nie cofać bazy podczas rollbacku.

## Odbiór

Szczegółowe wyniki i granice w ACCEPTANCE.md. Przeszły SQLite, MariaDB, Flute,
kontrakt C++, agent Python oraz izolowany GameDLL 1+9, 2+8 i 40 rund 22:18.
QA to nie odbiór dziesięciu prawdziwych klientów Steam. Publicznych kolejek nie
włączamy. Stare paczki 0.4.0/0.4.1 pozostają bajtowo niezmienione.
