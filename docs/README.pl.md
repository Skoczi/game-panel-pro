# Game Panel PRO

**Twoje serwery. Twoja infrastruktura. Jeden panel.**

Samodzielnie hostowany panel do zarządzania serwerami gier na wielu maszynach Linux. Konsola, pliki, konfiguracja, dodatki, backupy i API w jednym interfejsie na komputer i telefon.

[English](../README.md) · [Podręcznik operatora](USER-GUIDE.pl.md) · [Dokumentacja techniczna](README.md) · [Zmiany 2.1.0](pro/RELEASE-2.1.0.md)

![Lista serwerów Game Panel PRO](screenshots/fleet-dark.png)

*Działający interfejs aplikacji z danymi demonstracyjnymi.*

## Co dostajesz

- Wspólną listę serwerów i globalne ID na wszystkich node, sortowanie IP:port i własną kolejność.
- Konsolę z wyszukiwaniem, edytor plików z historią, menu kontekstowe i adresy URL obsługujące przyciski przeglądarki.
- Role użytkownika i operatora oraz dostęp server-admin bez terminala i zmiany CPU/IP/portów.
- Template CS 1.6/ReHLDS, Source, CS:GO Legacy, CS2 i Classic Offensive; narzędzia do instalacji frameworków.
- Zweryfikowane backupy Native, retencję, kopie zewnętrzne oraz kontrolowane klonowanie i transfer.
- SFTP dla serwera, dodatkowe IP node, współdzielone pliki gry i monitoring.
- API v1: lista i szczegóły serwerów, instalacja, operacje, konta, przypisania i administratorzy AMXX.

## Instalacja

Potrzebny jest obsługiwany Debian/Ubuntu, root, domena i dostępne porty 80/443. Budowanie ze źródeł wymaga co najmniej 6 GiB dostępnego RAM; zasoby gier licz osobno.

```bash
git clone --branch v2.1.0 --depth 1 https://github.com/Skoczi/game-panel-skoczi.git
cd game-panel-skoczi
sudo bash deploy/install.sh
```

Instalator buduje panel lokalnie i konfiguruje HTTPS. Odmawia nadpisania niepustego katalogu. Telemetria jest domyślnie wyłączona.

**Aktualizacja z 2.0.x:** wykonaj pierwsze przejście przez skrypty nowego wydania. Stary aktualizator odrzuca wersję 2.1.0. Przy wielu node aktualizuj agentów i panel w sposób skoordynowany. [Instalacja i odzyskiwanie](pro/INSTALL.md) · [Wdrażanie node](pro/DEPLOYMENT.md).

## Dokumentacja API

[PDF PL](api/game-panel-pro-api-v1-pl.pdf) · [PDF EN](api/game-panel-pro-api-v1-en.pdf) · [Przewodnik](pro/API-V1-GUIDE.md) · [OpenAPI](pro/openapi-v1.json)

PDF-y opisują kontrakt API wdrożony przed wydaniem 2.1.0. Nie zastępują instrukcji instalacji panelu ani ograniczeń konkretnego runtime.

## Projekt

Rozwijany przez **Skoczi**. Błędy i propozycje zgłaszaj w [GitHub Issues](https://github.com/Skoczi/game-panel-skoczi/issues), bez haseł, tokenów i prywatnych plików.

Licencja Apache 2.0. Informacje o prawach autorskich i wykorzystanym oprogramowaniu: [LICENSE](../LICENSE), [pełna licencja](../LICENSE-2.0.txt), [NOTICE](../NOTICE).
