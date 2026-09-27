import { useState } from 'react';
import { Plus, ArrowUp, ArrowDown, X, GripVertical } from 'lucide-react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function RotationRow({ id, name, index, count, disabled, move, remove }: { id: string; name: string; index: number; count: number; disabled: boolean; move: (delta: number) => void; remove: () => void }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`gp-map-row gp-map-sortable${isDragging ? ' is-dragging' : ''}`}>
    <button ref={setActivatorNodeRef} type="button" className="gp-map-grip" disabled={disabled} {...attributes} {...listeners} aria-label={`Reorder ${name} ${index + 1}`}><GripVertical size={16} /></button>
    <small>{index + 1}</small><span>{name}</span>
    <button type="button" disabled={disabled || index === 0} aria-label={`Move ${name} up ${index + 1}`} onClick={() => move(-1)}><ArrowUp size={16} /></button>
    <button type="button" disabled={disabled || index === count - 1} aria-label={`Move ${name} down ${index + 1}`} onClick={() => move(1)}><ArrowDown size={16} /></button>
    <button type="button" disabled={disabled} aria-label={`Remove ${name} ${index + 1}`} onClick={remove}><X size={16} /></button>
  </li>;
}

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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const lines = value.split(/\r?\n/).filter(Boolean);
  // Keep focus on the moved map, including rotations containing duplicate names.
  const ids = lines.map((name, index) => JSON.stringify([name, lines.slice(0, index).filter(line => line === name).length]));
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
                  <Plus size={16} aria-hidden="true" />
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

        <DndContext sensors={sensors} collisionDetection={closestCenter} accessibility={{ announcements: {
          onDragStart: ({ active }) => `Picked up ${lines[ids.indexOf(String(active.id))]}.`,
          onDragOver: ({ over }) => over ? `Position ${ids.indexOf(String(over.id)) + 1} of ${lines.length}.` : 'Outside rotation.',
          onDragEnd: () => 'Rotation updated. Review before saving.',
          onDragCancel: () => 'Reordering cancelled.',
        } }} onDragEnd={({ active, over }) => { if (over && active.id !== over.id && !disabled) update(arrayMove(lines, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))); }}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="gp-map-list">
          {lines.map((name, index) => (
            <RotationRow key={ids[index]} id={ids[index]} name={name} index={index} count={lines.length} disabled={disabled} move={delta => move(index, delta)} remove={() => update(lines.filter((_, i) => i !== index))} />
          ))}
        </ol>
        </SortableContext></DndContext>
        {!lines.length && (
          <p className="gp-workflow-notice">Your rotation is empty. Add a map from the library.</p>
        )}
      </section>
    </div>
  );
}
