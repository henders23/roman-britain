import type { Atlas } from '../data/dataset';
import type { Journey } from '../data/schema';
import { formatShort, formatYear } from '../data/time';
import { useState } from 'react';
import { store, useAtlas } from '../store';
import { Pin } from './Panels';

/** A stop's picture from Wikimedia Commons, small; its pin symbol if it has none or the picture fails. */
function Thumb({ atlas, kind, area, file }: { atlas: Atlas; kind: string; area: boolean; file?: string }) {
  const [failed, setFailed] = useState(false);
  if (!file || failed) return <Pin atlas={atlas} kind={kind} area={area} size={26} />;
  const name = encodeURIComponent(file.replace(/ /g, '_'));
  return <img src={`https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=120`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);

function span(atlas: Atlas, j: Journey) {
  const evs = j.stops.map((s) => atlas.events.find((e) => e.id === s.event)!);
  const a = Math.floor(Math.min(...evs.map((e) => e.t0)));
  const b = Math.floor(Math.max(...evs.map((e) => e.t0)));
  return a === b ? formatYear(a) : `${formatYear(a)} – ${formatYear(b)}`;
}

export function JourneyList({ atlas, onStart }: { atlas: Atlas; onStart: (id: string) => void }) {
  return (
    <aside className="panel journeys" aria-label="Journeys">
      <header>
        <h2>Journeys</h2>
        <span className="count">{atlas.journeys.length}</span>
        <button className="close" onClick={() => store.set({ panel: null })} aria-label="Close">×</button>
        <p className="j-help">Guided routes through events on the map. The camera and timeline follow each stop; the text is its author’s interpretation.</p>
      </header>
      <ol className="j-list">
        {atlas.journeys.map((j) => (
          <li key={j.id}>
            <button onClick={() => onStart(j.id)}>
              <b>{j.title}</b>
              <span>
                {j.stops.length} stops · {span(atlas, j)}
                {j.by && ` · ${j.by}`}
              </span>
              {atlas.draft && j.placeholder && <em className="ev-flag">Placeholder text</em>}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function JourneyCard({ atlas, journey, step, onStep, onExit }: { atlas: Atlas; journey: Journey; step: number; onStep: (n: number) => void; onExit: () => void }) {
  const auto = useAtlas((s) => s.journeyAuto);
  const n = journey.stops.length;
  const stop = step > 0 ? journey.stops[step - 1] : null;
  const ev = stop ? atlas.events.find((e) => e.id === stop.event) : undefined;
  const text = stop ? stop.text : journey.intro;
  return (
    <section className="journey-card" aria-label={`Journey: ${journey.title}`} aria-live="polite">
      <header>
        <span className="kicker">Journey · {step === 0 ? `${n} stops` : `Stop ${step} of ${n}`}</span>
        <button className="close" onClick={onExit} aria-label="Leave journey">×</button>
        <h3>{journey.title}</h3>
        {journey.by && step === 0 && <p className="j-by">By {journey.by}</p>}
      </header>
      {ev && (
        <button className="j-stop" onClick={() => store.set({ selected: ev.id })}>
          <Pin atlas={atlas} kind={ev.kind} area={ev.geometry === 'area'} size={22} />
          <span>
            <b>{ev.title}</b>
            <em>{formatShort(ev.start, ev.end, ev.datePrecision)} · {ev.place}</em>
          </span>
        </button>
      )}
      <div className="j-text">
        {paragraphs(text).map((p, k) => (
          <p key={k}>{p}</p>
        ))}
        <span className="synth" title="Written by the journey’s author; the evidence is in each event’s card">Journey author’s interpretation</span>
        {journey.thread !== 'none' && step >= 2 && <p className="j-thread-note">The dotted line shows the order of the story, not a route.</p>}
      </div>
      <ol className="j-strip" aria-label="Stops">
        <li>
          <button className={`j-thumb j-intro${step === 0 ? ' on' : ''}`} onClick={() => onStep(0)} aria-current={step === 0 ? 'step' : undefined} title="Introduction">
            <span aria-hidden>i</span>
          </button>
        </li>
        {journey.stops.map((st, i) => {
          const n = i + 1;
          const ev = atlas.events.find((e) => e.id === st.event);
          // Stops not yet reached show only their number, so the strip does not give away what comes next.
          const reached = n <= step;
          return (
            <li key={st.event}>
              <button
                className={`j-thumb${n === step ? ' on' : reached ? ' done' : ' ahead'}`}
                onClick={() => onStep(n)}
                aria-current={n === step ? 'step' : undefined}
                title={reached && ev ? `${n}. ${ev.title}` : `Stop ${n}`}
              >
                {reached && ev ? <Thumb atlas={atlas} kind={ev.kind} area={ev.geometry === 'area'} file={ev.image?.file} /> : <span>{n}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <footer>
        <button onClick={() => onStep(step - 1)} disabled={step === 0}>← Back</button>
        <label className="toggle" title="Move to the next stop every few seconds">
          <input type="checkbox" checked={auto} onChange={(e) => store.set({ journeyAuto: e.target.checked })} /> Auto
        </label>
        {step < n ? (
          <button className="primary" onClick={() => onStep(step + 1)}>{step === 0 ? 'Begin →' : 'Next →'}</button>
        ) : (
          <button className="primary" onClick={onExit}>Finish</button>
        )}
      </footer>
    </section>
  );
}
