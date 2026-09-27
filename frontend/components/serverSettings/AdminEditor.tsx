import { useState } from 'react';
import { Pencil, Trash2, Shield } from 'lucide-react';
import { AppButton } from '../../src/ui/components';

const permissions = [
  ['a', 'Immunity'],
  ['b', 'Reserved slot'],
  ['c', 'Kick'],
  ['d', 'Ban'],
  ['e', 'Slay'],
  ['f', 'Change map'],
  ['g', 'Cvars'],
  ['h', 'Configs'],
  ['i', 'Admin chat'],
  ['j', 'Vote'],
  ['k', 'Server password'],
  ['l', 'RCON'],
  ...'mnopqrst'.split('').map((flag) => [flag, `Custom ${flag}`]),
  ['u', 'Menu'],
];
export function AdminEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [steamId, setSteamId] = useState('');
  const [flags, setFlags] = useState('bcdefiju');
  const lines = value.split('\n');
  const entries = lines.flatMap((line, index) => {
    const match = /^\s*"(STEAM_[0-5]:[01]:\d+)"\s+""\s+"([a-u]+)"\s+"ce"\s*(?:;.*)?$/.exec(line);
    return match ? [{ index, id: match[1], flags: match[2] }] : [];
  });
  const valid =
    /^STEAM_[0-5]:[01]:\d+$/.test(steamId.trim()) &&
    /^[a-u]+$/.test(flags) &&
    !entries.some((e) => e.id === steamId.trim() && e.index !== editing);
  return (
    <section className="gp-workflow-card" aria-label="Game administrators">
      <h3>
        <Shield size={18} aria-hidden="true" /> Steam administrators &middot; {entries.length}
      </h3>
      <input
        aria-label="Search administrators"
        placeholder="Search Steam ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="gp-map-list">
        {entries
          .filter((entry) => entry.id.toLowerCase().includes(search.toLowerCase()))
          .map((entry) => (
            <div className="gp-map-row" key={entry.index}>
              <span>
                <code>{entry.id}</code>
                <small className="gp-admin-flags">{entry.flags}</small>
              </span>
              <button
                type="button"
                aria-label={`Edit ${entry.id}`}
                disabled={disabled}
                onClick={() => {
                  setEditing(entry.index);
                  setSteamId(entry.id);
                  setFlags(entry.flags);
                }}
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${entry.id}`}
                disabled={disabled}
                onClick={() => {
                  onChange(lines.filter((_, i) => i !== entry.index).join('\n'));
                  setEditing(null);
                  setSteamId('');
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
      </div>
      {!entries.length && <p className="gp-workflow-notice">No Steam administrators.</p>}
      {entries.length > 0 &&
        !entries.some((entry) => entry.id.toLowerCase().includes(search.toLowerCase())) && (
          <p className="gp-workflow-muted">No matching administrators.</p>
        )}
      <h4 className="gp-admin-form-title">
        {editing === null ? 'New administrator' : 'Edit administrator'}
      </h4>
      <div className="gp-workflow-grid mt-4">
        <label>
          Steam ID
          <input
            value={steamId}
            placeholder="STEAM_0:1:123456"
            disabled={disabled}
            onChange={(e) => setSteamId(e.target.value)}
          />
        </label>
        <label>
          Permission flags
          <input value={flags} disabled={disabled} onChange={(e) => setFlags(e.target.value)} />
        </label>
      </div>
      <fieldset className="gp-admin-permissions" disabled={disabled}>
        <legend>Permissions</legend>
        {permissions.map(([flag, label]) => (
          <label key={flag}>
            <input
              type="checkbox"
              checked={flags.includes(flag)}
              onChange={(e) =>
                setFlags(
                  e.target.checked
                    ? [...new Set(flags + flag)].sort().join('')
                    : flags.split(flag).join('')
                )
              }
            />
            <span>{label}</span>
            <code>{flag}</code>
          </label>
        ))}
      </fieldset>
      <div className="gp-workflow-actions">
        <AppButton
          disabled={disabled || !valid}
          onClick={() => {
            const row = `"${steamId.trim()}" "" "${flags}" "ce"`;
            if (editing === null) onChange(value.trimEnd() + `\n${row}\n`);
            else
              onChange(
                lines
                  .map((line, index) =>
                    index === editing
                      ? line.replace(
                          /^(\s*)"[^" ]+"\s+""\s+"[a-u]+"\s+"ce"/,
                          (_, indent) => indent + row
                        )
                      : line
                  )
                  .join('\n')
              );
            setEditing(null);
            setSteamId('');
          }}
        >
          {editing === null ? 'Add administrator to draft' : 'Update administrator in draft'}
        </AppButton>
        {editing !== null && (
          <AppButton
            onClick={() => {
              setEditing(null);
              setSteamId('');
              setFlags('bcdefiju');
            }}
          >
            Cancel edit
          </AppButton>
        )}
      </div>
    </section>
  );
}
