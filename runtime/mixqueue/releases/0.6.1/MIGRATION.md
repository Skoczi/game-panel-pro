# WWW 0.7.1

Migracja jest addytywna: `mq2_ready_windows(match_id, deadline, completed_at)`.
Nie przepisuje przypisań ani config_hash, generacji, wyników lub historii.
Nowy worker i endpoint korzystają z tej samej tabeli i dotychczasowej blokady
transakcyjnej. loaded bez ready_deadline zachowuje kompatybilność z aktywnymi
starszymi kontrolerami. Nowy ranked wymaga możliwości kontrolera 0.6.1.

Nowe adresy (PL/EN i ladder zachowane):

- `/play?ladder=cs16-5v5&lang=en&page=ranking`
- `/play?ladder=cs16-5v5&lang=en&page=history`
- `/play?ladder=cs16-5v5&lang=en&page=history&history=test`
- `/play?ladder=cs16-5v5&lang=en&match=<pełne 24-znakowe ID>`

Nie potrzeba nowych reguł nginx. Nawigacja używa prawdziwych anchorów i History
API; przełączenia gry/formatu/filtra mają własny wpis historii. Uprawnienia
Flute nadal dotyczą bezpośrednich linków. Nie opublikowano prywatnych testów.

Nowa polityka kar korzysta z istniejących mq2_penalties. Poprzednie ready_missed,
not_ready i no_show z ostatnich siedmiu dni wliczają się do nowych progów;
nie wydłużamy już nałożonych kar. Reset licznika nie usuwa rekordów.

Wdrożenie: backup plików i bazy, kontrola hashów plików bazowych, addytywna
migracja, publikacja PL/EN/CSS, cache/template clear i restart workera WWW.
Rollback przywraca pliki/symlink; nie odtwarza starej bazy nad nowymi meczami.
Nie zmieniaj eligibility serwerów ani kolejek przy tym wdrożeniu.
