import type { Atlas } from '../data/dataset';
import type { Journey } from '../data/schema';
import { formatShort, formatYear } from '../data/time';
import { kmBetween } from '../data/journey';
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
  const summary = step > n;
  const stop = step > 0 && !summary ? journey.stops[step - 1] : null;
  const ev = stop ? atlas.events.find((e) => e.id === stop.event) : undefined;
  const text = stop ? stop.text : journey.intro;
  return (
    <section className="journey-card" aria-label={`Journey: ${journey.title}`} aria-live="polite">
      <header>
        <span className="kicker">Journey · {summary ? 'Summary' : step === 0 ? `${n} stops` : `Stop ${step} of ${n}`}</span>
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
      {summary ? (
        <JourneySummary atlas={atlas} journey={journey} onStep={onStep} />
      ) : (
        <div className="j-text">
          {paragraphs(text).map((p, k) => (
            <p key={k}>{p}</p>
          ))}
          <span className="synth" title="Written by the journey’s author; the evidence is in each event’s card">Journey author’s interpretation</span>
          {journey.thread !== 'none' && step >= 2 && <p className="j-thread-note">The dotted line shows the order of the story, not a route.</p>}
        </div>
      )}
      <ol className="j-strip" aria-label="Stops">
        <li>
          <button className={`j-thumb j-intro${step === 0 ? ' on' : ''}`} onClick={() => onStep(0)} aria-current={step === 0 ? 'step' : undefined} title="Introduction">
            <span aria-hidden>i</span>
          </button>
        </li>
        {journey.stops.map((st, i) => {
          const k = i + 1;
          const e = atlas.events.find((x) => x.id === st.event);
          // Stops not yet reached show only their number, so the strip does not give away what comes next.
          const reached = k <= step;
          return (
            <li key={st.event}>
              <button
                className={`j-thumb${k === step ? ' on' : reached ? ' done' : ' ahead'}`}
                onClick={() => onStep(k)}
                aria-current={k === step ? 'step' : undefined}
                title={reached && e ? `${k}. ${e.title}` : `Stop ${k}`}
              >
                {reached && e ? <Thumb atlas={atlas} kind={e.kind} area={e.geometry === 'area'} file={e.image?.file} /> : <span>{k}</span>}
              </button>
            </li>
          );
        })}
        <li>
          <button className={`j-thumb j-intro${summary ? ' on' : step === n ? '' : ' ahead'}`} onClick={() => onStep(n + 1)} aria-current={summary ? 'step' : undefined} title="Journey’s end">
            <span aria-hidden>✓</span>
          </button>
        </li>
      </ol>
      <footer>
        <button onClick={() => onStep(step - 1)} disabled={step === 0}>← Back</button>
        {!summary && (
          <label className="toggle" title="Move to the next stop every few seconds">
            <input type="checkbox" checked={auto} onChange={(e) => store.set({ journeyAuto: e.target.checked })} /> Auto
          </label>
        )}
        {summary ? (
          <button className="primary" onClick={onExit}>Finish</button>
        ) : (
          <button className="primary" onClick={() => onStep(step + 1)}>{step === 0 ? 'Begin →' : step === n ? 'Journey’s end →' : 'Next →'}</button>
        )}
      </footer>
    </section>
  );
}

/** The end of a journey: how far it went in time and space, and every stop to revisit. */
function JourneySummary({ atlas, journey, onStep }: { atlas: Atlas; journey: Journey; onStep: (n: number) => void }) {
  const evs = journey.stops.map((s) => atlas.events.find((e) => e.id === s.event)!);
  const places = new Set(evs.map((e) => `${e.lon.toFixed(2)},${e.lat.toFixed(2)}`)).size;
  let km = 0;
  for (let i = 1; i < evs.length; i++) km += kmBetween(evs[i - 1], evs[i]);
  const kmText = km < 20 ? Math.round(km) : km < 1000 ? Math.round(km / 10) * 10 : Math.round(km / 50) * 50;
  return (
    <div className="j-text j-summary">
      <dl className="j-stats">
        <div>
          <dt>Years</dt>
          <dd>{span(atlas, journey)}</dd>
        </div>
        <div>
          <dt>{places === 1 ? 'Place' : 'Places'}</dt>
          <dd>{places}</dd>
        </div>
        {journey.thread !== 'none' && places > 1 && (
          <div>
            <dt>Along the thread</dt>
            <dd>about {kmText.toLocaleString('en-GB')} km</dd>
          </div>
        )}
      </dl>
      <ol className="j-recap">
        {evs.map((e, i) => (
          <li key={e.id}>
            <button onClick={() => onStep(i + 1)}>
              <span className="n">{i + 1}</span>
              <span>
                <b>{e.title}</b>
                <em>{formatShort(e.start, e.end, e.datePrecision)} · {e.place}</em>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {journey.thread !== 'none' && <p className="j-thread-note">Distances are straight lines between stops in story order, not routes travelled.</p>}
    </div>
  );
}
