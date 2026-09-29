# ESERV: wdrożenie CSCO MatchBot 0.6.1

Nowa niezmienna paczka: `mixqueue2-eserv-0.6.1.zip`, manifest i SHA256SUMS.
Źródła: `mixqueue2-cs16-0.6.1-source.zip`. Nie zastępuj starszych wydań.
Przeczytaj RELEASE-CS16-0.6.1.md, INSTALL.pl.md i ACCEPTANCE.md z ZIP.

Kontroler **0.6.1**, WWW minimum **0.7.1**, agent **0.6.0 bez zmian**.
Źródło mq_agent.py SHA256:
`6274415004a73cbf2750ab9138746ad87f8b84329721c80e96600097907c092a`.
Oryginalna paczka agenta SHA256:
`b1be179add3b5b71de07c5738ab0566b923c6368e4dc01e270ed91adf34e2ce4`.
Nie podbijaj fikcyjnie wersji agenta do 0.6.1. Dla starszego runtime zainstaluj
dołączone 0.6.0 przez istniejący mechanizm. Protocol 2, amxx, contract 3,
stats v2, inventory 1; nowe pole loaded.ready_deadline przenosi obecny agent.

Zakres: 1 x 90 s reconnect na drużynę ranked; 3 x 30 s taktyczne kapitana,
natychmiast podczas freeze, inaczej po rundzie; oba /unpause bez restartu;
300 s na wszystkich /ready w ranked/full_test, synchronizacja WWW/HUD,
bez late-start i bez kar/ELO w testach. WWW ma eskalację 30/60/120/1440 minut
z pamięcią 7 dni oraz auto-requeue zaakceptowanych. WWW ma też własne adresy
meczu, rankingu i historii oraz uproszczony modal akceptacji.

Zaktualizuj uniwersalny instalator WAW1/WAW2 po weryfikacji hashów. Restart
wyłącznie pustego SRV-107, bez aktywnego lease. Nie włączaj publicznej puli.
CSCO nie instalował tej binarki na aktywnym serwerze gry.
Zachowaj klucze/identyfikatory, spool/WAL, journal, generacje, active-matchbot,
original-hostname, recovery, historię i pozostałe AMXX. Reviewed conflicts
mq2_match.amxx/statsx.amxx pozostają; brak nowych dowolnych komend RCON.

Odbiór na prawdziwych klientach Steam nadal wymagany. Zacznij od 2+8 z dwoma
kapitanami, PL/EN, pause/freezetime/oba unpause, wynik i ekwipunek bez resetu.
Sprawdź rzeczywiste 5 minut /ready i normalne cancel/cleanup/idle. Nie traktuj
QA GameDLL ani testu warmup z botami jako potwierdzenia Steam/reconnect.
Automatyczna ścieżka disconnect/abandon zachowuje wyłączenie w full_test;
jej odbiór wymaga osobnego zamkniętego scenariusza ranked, bez publicznej puli.
