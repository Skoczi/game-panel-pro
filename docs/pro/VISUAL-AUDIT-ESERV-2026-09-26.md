# Audyt wizualny eserv.pl — 26.09.2026

## Werdykt i zakres

Panel ma funkcje produktu administracyjnego, ale nowe ekrany nie trzymają jakości wizualnej wspólnego produktu. Główne przyczyny: mieszanie komponentów ODS/App UI z surowymi kontrolkami, brak hierarchii działań, formularze rozciągane do szerokości monitora i błędne reguły wysokości konsoli. To nie jest dowód, że cały arkusz CSS nie został załadowany.

Podstawa: pięć zrzutów użytkownika i inspekcja źródeł. Potwierdzono ekrany: Game Servers, konsola, bezpieczeństwo konta, klonowanie, mapy/rotacja. Pozostałe ekrany wymagają osobnego odbioru wizualnego; nie uznajemy ich za sprawdzone. Testy funkcjonalne nie zastępują odbioru wyglądu. Nie wykonano pomiarów kontrastu ani testu na fizycznym iPhonie.

Priorytety odnoszą się do UX: P1 — utrudnia podstawowe zadanie lub istotnie psuje układ; P2 — niespójność i jakość produktu.

## Ustalenia i docelowy wygląd

| Priorytet | Ekran / dowód | Problem i skutek | Konkretna zmiana |
| --- | --- | --- | --- |
| P1 | Konsola; `server-page.css`, selektory `div:nth-child(2)` | Nowy pasek filtrów zajmuje drugą pozycję i dostaje flex-grow. Ogromna pusta przestrzeń wypycha logi. | Wysokość przypisać do `.gp-console-body`; pasek narzędzi ma naturalną wysokość i nie kurczy się. |
| P1 | Game Servers; `FleetWorkspace.tsx` | Diagnostyka całej infrastruktury zajmuje główne miejsce nad serwerami, nawet gdy nie ma problemów. | Przenieść OperationalOverview do Host Status, zachować zakres węzła i odnośniki do kopii/harmonogramów. Decyzja użytkownika. |
| P1 | Mapy; `RehldsManager.tsx` | Głównym sposobem zarządzania rotacją jest surowy textarea; trzeba znać składnię i nazwy plików. | Dwie listy: dostępne mapy z wyszukiwaniem i rotacja z numerami, dodaniem/usunięciem oraz zmianą kolejności także klawiaturą. Edycja tekstowa jako tryb zaawansowany. Zachować przegląd zmian i snapshot. |
| P1 | Klonowanie; `CloneManager.tsx` | Długi blok instrukcji, pełna szerokość pól, niewyrównane porty, warunek zatrzymania ukryty w tekście. | Formularz max 760 px; obok podsumowanie źródła/docelowego hosta. Kroki: miejsce i nazwa → sieć → przegląd. Widoczny status gotowości, konkretne powody blokady. Bez automatycznego zatrzymywania źródła. |
| P2 | Bezpieczeństwo; `AccountSecurityModal.tsx` | Pełny user-agent dominuje nad informacją o sesji; modal jest ciasny, akcje mają podobną wagę. | Sekcje 2FA i urządzenia; nazwa np. Chrome · Windows, oznaczenie bieżącej sesji, daty drugorzędne, raw UA pod szczegółami. Czytelne kroki hasło → QR/kod → kody odzyskiwania. |
| P2 | Konsola; `ServerConsoleTabs.tsx` | Natywny checkbox/select i przypadkowe szerokości obok istniejących kontrolek; rozbudowana kolumna metryk. | Jeden zwarty pasek filtrów, zaawansowane opcje pod menu. CPU/RAM/dysk w zwartej sekcji, status gry i połączenie wyżej. Logi pozostają główną treścią. |
| P2 | Konfiguracja gry | Kilka poziomów zakładek i przycisków wygląda podobnie; trudno rozpoznać aktywną sekcję. | Główne zakładki dla obszarów; wewnętrzna nawigacja z wyraźnym selected/focus. Klonowanie jako osobna operacja, a nie sąsiad edycji map. |
| P2 | Wspólne formularze | Kontrolki o różnych wysokościach, obrysach i odstępach; wszystkie przyciski podobnie ważne. | Jedna rodzina pól/selectów/toggle/button; główna akcja jedna na sekcję, drugorzędne neutralne, destrukcyjne odseparowane. |
| P2 | Powierzchnie / typografia | Zagnieżdżone obramowania, dużo pustych kart i małe metadane konkurujące z nagłówkiem. | Mniej ramek, wyraźne trzy poziomy powierzchni, stała skala tekstu i odstępów; długość sekcji wynika z treści. |

## Specyfikacja kierunku premium

Stonowany grafit/granat i turkus jako akcent akcji lub wyboru. Kolory statusu zarezerwowane dla znaczenia. Bez dokładania efektów dekoracyjnych, które utrudniają odczyt logów.

- Odstępy: 4/8/12/16/24/32 px. Promienie: 8 px kontrolki, 12 px karty, 16 px modal. Cienie głównie dla warstw nad treścią.
- Typografia: tekst 14–15 px, etykiety i metadane 12–13 px, nagłówki sekcji 16–18 px, strony 24 px. Monospace dla logów, adresów i kodu.
- Pola i przyciski: wspólna wysokość 40 px na desktopie, obszary dotyku minimum 44 px na mobile. Formularze ograniczone szerokością; tabele i konsola mogą korzystać z całego miejsca.
- Status zawsze tekst + ikona, nie tylko kolor. Widoczny focus klawiatury. Kontrast sprawdzić pomiarem: 4.5:1 dla zwykłego tekstu, 3:1 dla dużego tekstu i istotnych granic kontrolek.
- Host Status: zwarty nagłówek zdrowia, lista incydentów gdy są problemy, szczegóły wersji niżej. Zdrowa infrastruktura nie potrzebuje wielkiego pustego panelu.
- Game Servers: wyszukiwanie, filtry, lista/karty serwerów i akcje. Diagnostyka infrastruktury w Host Status.
- Modal: stały nagłówek, przewijana treść, czytelna akcja końcowa; na telefonie szerokość viewportu z bezpiecznymi marginesami. QR nigdy nie przycięty.
- Wspólne stany: ładowanie, brak danych, błąd z retry, brak uprawnień, zmiany niezapisane i operacja w toku. Nie pokazywać pustych kart jako substytutu stanu.

## Kolejność przebudowy

1. Naprawa konsoli i przeniesienie Needs attention — mały, niezależny zakres bieżącej poprawki.
2. Wspólne komponenty i tokeny — inwentaryzacja App UI/ODS i surowych kontrolek; jeden kontrakt wyglądu i stanów.
3. Konsola i szczegóły serwera — główny codzienny ekran; dopracować gęstość i mobile.
4. Bezpieczeństwo konta — sesje, proces 2FA, QR i odzyskiwanie.
5. Mapy, administratorzy, pluginy i dodatki — zarządzanie obiektami zamiast obowiązkowej edycji plików.
6. Klonowanie i transfer — uporządkowany proces z przeglądem skutków i stanem zadania.
7. Przejść pozostałe ekrany (backups, schedules, nodes, settings, users, login) tym samym standardem; odebrać pełną nawigację.

## Odbiór

Dla każdej przebudowanej strony: zrzuty 1440×900, 1920×1080 i 390×844; dark/light; dane, pusty stan i błąd. Sprawdzić zoom 200%, klawiaturę, długie nazwy, przewijanie oraz brak poziomego overflow. Screenshoty ocenić wzrokowo, a geometrię krytycznych obszarów sprawdzać testem. Test konsoli powinien wykrywać rozciągnięty toolbar, nie tylko obecność logów. Na końcu Safari/iPhone dla QR, modali i klawiatury ekranowej.

Pełny redesign nie jest ukończony w ramach tego audytu. Powyższe wartości są docelową specyfikacją, nie deklaracją zgodności obecnego panelu.

## Bieżąca poprawka — weryfikacja

Przeniesiono OperationalOverview do Host Status, zachowując zakres węzła i mapowanie odnośników do serwerów. Zastąpiono dwa pozycyjne selektory CSS selektorem obszaru logów. Frontend build: OK (istniejące ostrzeżenie o dużym chunku Monaco). 54 dotychczasowe testy UI oraz dwa dodatkowe testy lokalizacji i geometrii: OK. Oceniono zrzut konsoli 1440 px: usunięty pusty obszar nad logami. To poprawka funkcjonalnego układu, nie zakończony redesign.
