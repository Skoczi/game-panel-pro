# API v1 — integracja usług

Baza: `https://panel.example.com/api/v1`. Kontrakt: [openapi-v1.json](./openapi-v1.json). [English guide](API-V1-GUIDE.en.md).

## Token

W **Account → API tokens** wybierz serwery i zakresy. Sekret pojawia się jeden raz. Zakresy administracyjne wymagają administratora panelu. Bieżąca rola i uprawnienia właściciela są sprawdzane przy każdym żądaniu.

**Install servers** dodaje politykę: dozwolone node, template, limit vCPU/MiB na serwer i budżet utworzeń. Budżet obejmuje również niepewne i nieudane próby; nie odnawia się po usunięciu serwera. Utworzony serwer zostaje przypisany do tokenu. Stare tokeny zachowują dotychczasowe zakresy.

Nagłówek uwierzytelniania: `Authorization: Bearer <token>`. Nie zapisuj sekretu w URL ani repozytorium.

## Lista i szczegóły

UUID jest kanonicznym `id`, `number` to globalny numer. Wszystkie ścieżki `/servers/{id}` akceptują oba. Przykłady: `GET /servers/101`, `GET /servers?sort=address&limit=25`.

Lista zachowuje domyślne sortowanie po UUID. `sort=address` porównuje IP numerycznie, potem porty. Dostępne są też `number`, `name` oraz filtry `search`, `status`, `game` (catalog ID), `node` (UUID lub `local`).

`nextCursor` przekaż jako `after` z tymi samymi filtrami. Jeśli kursor przestanie istnieć po zmianie inwentarza lub grantów, zacznij od pierwszej strony. To paginacja bieżącego inwentarza, nie zamrożony snapshot.

Lista korzysta z okresowego odświeżania floty. Detail odpytuje właściwy runtime. `available=false`, `stale=true`, `status=unknown` oznaczają brak świeżego potwierdzenia, nie zatrzymanie. `game` opisuje niezależny monitoring gry. `null` oznacza brak pomiaru/obsługi, nie zero. `resourceUsage` w detail wymaga `resources.read`. Odpowiedzi nie zawierają środowiska, haseł, komend startowych, ścieżek hosta ani kluczy node.

## Instalacja

1. `GET /templates` — opublikowane wersje Native i wymagane zmienne/porty.
2. `GET /nodes` i `/nodes/{id}/allocations` — lokalizacje i pule portów.
3. `POST /servers/plan` — walidacja payloadu. Plan nie rezerwuje portów.
4. `POST /servers` — ten sam payload i trwały `Idempotency-Key`.
5. Odpytuj `Location`, czyli `/operations/{id}`. Zakończona instalacja pozostawia serwer **wyłączony**.

Przykładowy payload; użyj rzeczywistych node/template/bindings zwróconych przez API:

```json
{
  "nodeId": "NODE_UUID",
  "templateId": "TEMPLATE_ID",
  "templateVersion": 1,
  "name": "DD2",
  "resourceLimits": { "cpu": 1, "memoryMb": 1024 },
  "bindings": [{ "key": "game", "hostIp": "192.0.2.10", "host": "auto" }],
  "variables": {}
}
```

Przekaż wszystkie porty wymagane przez template. Linked TCP/UDP używają tego samego IP i portu. `auto` wybiera wolny port z przypisanej puli. Tworzenie ponownie sprawdza i rezerwuje porty pod blokadą. Numer serwera pochodzi z centralnej bazy panelu.

`202` potwierdza przyjęcie. `409` z `data.status=uncertain` oznacza niepotwierdzony wynik: zachowaj klucz i odpytuj operację. Panel odnajduje serwer po trwałym identyfikatorze instalacji na node. Nie powtarza niepewnego zlecenia. Nierozstrzygnięty wynik wymaga sprawdzenia historii w panelu. Budżet nie jest automatycznie zwracany.

Klucz ma 16–128 liter, cyfr, znaków `-` lub `_`. Powtórzenie tego samego payloadu i klucza nie tworzy drugiej usługi. Inny payload z tym samym kluczem daje 409. Przestrzeń kluczy instalacji jest osobna od backup/power.

Obsługiwane są **Native templates** z oddzielnym przygotowaniem plików. Legacy LinuxGSM/OVHcloud nie są udostępniane w tym przepływie, bo ich instalator może uruchamiać grę. API nie przyjmuje obrazów, skryptów, ścieżek mountów ani dowolnych komend klienta.

## Konta i dostęp

- `GET /users` (`users.read`) — stronicowana lista kont bez sekretów.
- `POST /users` (`users.create`) — `username` i `password`; zawsze rola `user`. Nazwa jest unikalna; konflikt daje 409.
- `GET /servers/{id}/members` — członkowie i presety.
- `PUT /servers/{id}/members/{userId}` — np. `{ "preset": "server-admin" }`.
- `DELETE /servers/{id}/members/{userId}` — odebranie dostępu.

`viewer`: odczyt konsoli. `console-operator`: dodatkowo komendy i power. `server-admin`: dodatkowo pliki, backupy, harmonogramy i SFTP. Żaden preset nie daje terminala ani edycji CPU/IP/portów/środowiska startowego.

Zmiana członkostwa wymaga administratora panelu i wskazanego serwera w tokenie. Nie można nią zmienić dostępu operatora ani superadmina. API nie tworzy operatorów, nie usuwa kont ani nie resetuje haseł. Po niepewnej odpowiedzi tworzenia użytkownika sprawdź jego unikalną nazwę przez `GET /users`.

## Admini gry

`GET /servers/{id}/game-admins` zwraca Steam ID adminów AMXX i `ETag`. `PUT /servers/{id}/game-admins/STEAM_0:1:123` z `{ "flags": "bcdefiju" }` dodaje/aktualizuje wpis. `DELETE` usuwa go. Oba wymagają `If-Match` z aktualnym, cytowanym ETag oraz `game-admins.write` i uprawnień do plików właściciela tokenu.

Zapis tworzy snapshot i atomowo zamienia plik. Komentarze i niestandardowe wpisy pozostają. Hasła z niestandardowych wpisów nie trafiają do odpowiedzi. Konflikt wersji daje 409, brak If-Match — 428. Zmiany nie wykonują komend w konsoli. Adapter obejmuje AMXX na CS 1.6/ReHLDS; SourceMod/CS2 wymagają odrębnych adapterów.

## Operacje i błędy

`GET /operations` listuje operacje tokenu, najnowsze pierwsze. Lista pokazuje stan przyjęcia; `links.self` prowadzi do bieżącego wyniku. Instalacja zwraca etap, procent, datę zakończenia i link do serwera. Backup/power zachowują istniejące ścieżki i idempotencję. Power completion potwierdza wykonanie akcji, nie gotowość gry.

Odpowiedzi mają `data` i `requestId`; błędy — `error.code`, `error.message`, `requestId`. Limit: 120 żądań/min/token, 429 zawiera `Retry-After`. Token API nie może zarządzać tokenami.

Poza obecnym kontraktem pozostają: provisioning legacy runtime, wieloodbiorcowe webhooki, administracja SourceMod/CS2, publiczne zapisy addonów/konfiguracji/harmonogramów oraz wydawanie haseł SFTP.
