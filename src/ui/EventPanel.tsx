import { kindLabel, type Atlas, type AtlasEvent } from '../data/dataset';
import { formatRange } from '../data/time';
import { store } from '../store';
import { Pin } from './Panels';

// Interim panel: the old war-specific fields are gone. The full evidence panel is the next step.
export function EventPanel({ ev, atlas, onClose }: { ev: AtlasEvent; atlas: Atlas; onClose: () => void }) {
  const i = ev.index;
  const prev = atlas.events[i - 1];
  const next = atlas.events[i + 1];
  const go = (e?: AtlasEvent) => e && store.set({ selected: e.id, t: e.t0 + 0.001, playing: false });
  return (
    <aside className="panel event-panel" aria-label={ev.title} key={ev.id}>
      <header>
        <div className="ev-kicker">
          <Pin atlas={atlas} kind={ev.kind} area={ev.geometry === 'area'} size={26} />
          <span>{kindLabel(atlas, ev.kind)}</span>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>{ev.title}</h2>
        <p className="ev-when">
          {formatRange(ev.start, ev.end, ev.datePrecision)} · {ev.place}
        </p>
      </header>
      <div className="ev-body">
        {ev.summary && <p className="ev-summary">{ev.summary}</p>}
        {ev.uncertaintyNote && <p>{ev.uncertaintyNote}</p>}
        <ol>
          {ev.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="ev-row">{ev.dispositionReason}</p>
      </div>
      <footer>
        <button disabled={!prev} onClick={() => go(prev)}>← {prev ? prev.title : ''}</button>
        <button disabled={!next} onClick={() => go(next)}>{next ? next.title : ''} →</button>
      </footer>
    </aside>
  );
}
