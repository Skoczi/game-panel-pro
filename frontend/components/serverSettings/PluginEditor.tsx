import { useState } from 'react';

export function PluginEditor({
  value,
  available,
  disabled,
  onChange,
}: {
  value: string;
  available: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const lines = value.split('\n');
  const pattern = /^(\s*)(;\s*)?([\w.-]+\.amxx)(.*)$/;
  const entries = lines.flatMap((line, index) => {
    const match = pattern.exec(line);
    return match ? [{ index, name: match[3], enabled: !match[2], match }] : [];
  });
  const update = (index: number, line: string) =>
    onChange(lines.map((old, i) => (i === index ? line : old)).join('\n'));
  return (
    <section className="gp-workflow-card" aria-label="Plugin manager">
      <h3>Installed plugins</h3>

      <input
        aria-label="Search plugins"
        placeholder="Search plugins…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {entries
        .filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()))
        .map((entry) => (
          <label className="gp-map-row" key={entry.index}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={entry.enabled}
              onChange={(e) =>
                update(
                  entry.index,
                  `${entry.match[1]}${e.target.checked ? '' : '; '}${entry.name}${entry.match[4]}`
                )
              }
            />
            <span>{entry.name}</span>
            <small style={{ width: 'auto' }}>{entry.enabled ? 'Enabled' : 'Disabled'}</small>
          </label>
        ))}
      {available
        .filter(
          (name) =>
            !entries.some((e) => e.name === name) &&
            name.toLowerCase().includes(query.toLowerCase())
        )
        .map((name) => (
          <div className="gp-map-row" key={name}>
            <span>{name}</span>
            <button
              disabled={disabled}
              type="button"
              aria-label={`Add plugin ${name}`}
              onClick={() => onChange(value.trimEnd() + '\n' + name + '\n')}
            >
              +
            </button>
          </div>
        ))}
      {!entries.length && !available.length && (
        <p className="gp-workflow-notice">
          No plugins found. Install AMX Mod X from Install addons first.
        </p>
      )}
    </section>
  );
}
