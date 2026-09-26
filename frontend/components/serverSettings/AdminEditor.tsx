import { useState } from 'react';
import { AppButton } from '../../src/ui/components';

export function AdminEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
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
    !entries.some((e) => e.id === steamId.trim());
  return (
    <section className="gp-workflow-card" aria-label="Game administrators">
      <h3>Steam administrators</h3>
      <p className="gp-workflow-muted">
        Manage Steam ID access. Other authentication formats remain intact in the advanced editor.
      </p>
      {entries.map((entry) => (
        <div className="gp-map-row" key={entry.index}>
          <span>
            {entry.id}
            <br />
            <small style={{ width: 'auto' }}>Permissions: {entry.flags}</small>
          </span>
          <AppButton
            disabled={disabled}
            onClick={() => onChange(lines.filter((_, i) => i !== entry.index).join('\n'))}
          >
            Remove {entry.id}
          </AppButton>
        </div>
      ))}
      {!entries.length && (
        <p className="gp-workflow-notice">No Steam administrators in this format yet.</p>
      )}
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
      <details>
        <summary>Permission guide</summary>
        <p className="gp-workflow-muted">
          a: immunity · b: reserved slot · c: kick · d: ban · e: slay · f: map · g: cvars · h:
          configs · i: chat · j: vote · k: server password · l: RCON · m–t: custom access · u: menu.
          Grant only the access needed.
        </p>
      </details>
      <AppButton
        disabled={disabled || !valid}
        onClick={() => {
          onChange(value.trimEnd() + `\n"${steamId.trim()}" "" "${flags}" "ce"\n`);
          setSteamId('');
        }}
      >
        Add administrator to draft
      </AppButton>
      <p className="gp-workflow-muted">
        Changes take effect only after Review changes and Save with snapshot.
      </p>
    </section>
  );
}
