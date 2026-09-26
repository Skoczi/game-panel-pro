import { useState } from 'react';

export function RotationEditor({
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
  const [search, setSearch] = useState('');
  const lines = value.split(/\r?\n/).filter(Boolean);
  // Preserve comments and unsupported entries: visual operations move full lines.
  const update = (next: string[]) => onChange(next.length ? next.join('\n') + '\n' : '');
  const move = (index: number, delta: number) => {
    const next = [...lines];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    update(next);
  };
  return (
    <div className="gp-workflow-grid">
      <section className="gp-workflow-card" aria-label="Available maps">
        <h3>
          Map library <span className="gp-workflow-muted">· {available.length}</span>
        </h3>
        <p className="gp-workflow-muted">Add installed maps to your rotation.</p>
        <input
          aria-label="Search installed maps"
          placeholder="Search maps…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="gp-map-list">
          {available
            .filter((name) => name.toLowerCase().includes(search.toLowerCase()))
            .map((name) => (
              <div className="gp-map-row" key={name}>
                <span>{name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Add ${name}`}
                  onClick={() => update([...lines, name])}
                >
                  +
                </button>
              </div>
            ))}
        </div>
        {!available.some((name) => name.toLowerCase().includes(search.toLowerCase())) && (
          <p className="gp-workflow-muted">No maps match your search.</p>
        )}
      </section>
      <section className="gp-workflow-card" aria-label="Map rotation">
        <h3>
          Rotation <span className="gp-workflow-muted">· {lines.length}</span>
        </h3>
        <p className="gp-workflow-muted">Played from top to bottom. Review before saving.</p>
        <ol className="gp-map-list">
          {lines.map((name, index) => (
            <li className="gp-map-row" key={`${index}:${name}`}>
              <small>{index + 1}</small>
              <span>{name}</span>
              <button
                type="button"
                disabled={disabled || index === 0}
                aria-label={`Move ${name} up ${index + 1}`}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || index === lines.length - 1}
                aria-label={`Move ${name} down ${index + 1}`}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${name} ${index + 1}`}
                onClick={() => update(lines.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        {!lines.length && (
          <p className="gp-workflow-notice">Your rotation is empty. Add a map from the library.</p>
        )}
      </section>
    </div>
  );
}
