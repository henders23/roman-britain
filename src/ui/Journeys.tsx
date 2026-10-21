import type { Atlas } from '../data/dataset';
import type { Journey } from '../data/schema';
import { formatShort, formatYear } from '../data/time';
import { kmBetween, placeGap, placeLink, timeGap, timeLink } from '../data/journey';
import { useEffect, useMemo, useState } from 'react';
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

// A turning point's stop text comes in three labelled paragraphs: what led up to it, the event, and what changed.
const SECTIONS: Record<string, string> = { 'Before:': 'Leading up to it', 'What happened:': 'What happened', 'After:': 'What changed' };
function section(p: string) {
  const label = Object.keys(SECTIONS).find((k) => p.startsWith(k));
  return label ? { label: SECTIONS[label], text: p.slice(label.length).trim() } : { label: '', text: p };
}

function span(atlas: Atlas, j: Journey) {
  const evs = j.stops.map((s) => atlas.events.find((e) => e.id === s.event)!);
  const a = Math.floor(Math.min(...evs.map((e) => e.t0)));
  const b = Math.floor(Math.max(...evs.map((e) => e.t0)));
  return a === b ? formatYear(a) : `${formatYear(a)} – ${formatYear(b)}`;
}

/** A journey as a tile: the first stop's picture, the title and how far it spans. */
export function JourneyTile({ atlas, journey: j, onStart, teaser = false, disabled = false }: { atlas: Atlas; journey: Journey; onStart: (id: string) => void; teaser?: boolean; disabled?: boolean }) {
  const evs = j.stops.map((s) => atlas.events.find((e) => e.id === s.event)!);
  const pic = evs.find((e) => e.image?.file) ?? evs[0];
  return (
    <button className="j-tile" onClick={() => onStart(j.id)} disabled={disabled}>
      <span className="j-tile-pic">
        <Thumb atlas={atlas} kind={pic.kind} area={pic.geometry === 'area'} file={pic.image?.file} />
      </span>
      <span className="j-tile-text">
        <b>{j.title}</b>
        <span>{j.stops.length} stops · {span(atlas, j)}</span>
        {teaser && <em className="j-teaser">{firstSentence(j.intro)}</em>}
        {atlas.draft && j.placeholder && <em className="ev-flag">Placeholder text</em>}
      </span>
    </button>
  );
}

const firstSentence = (s: string) => {
  const p = paragraphs(s)[0] ?? '';
  const m = p.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : p;
};

type Period = 'all' | 'roman' | 'after';
const ROMAN_END = 410;

/** The journey library: collections down one side, the open collection's journeys beside them,
 *  and one journey at a time opened to show its question, where it begins and where it ends.
 *  The open journey is previewed on the map through onPreview. */
export function JourneyLibrary({ atlas, onStart, onPreview, initial }: { atlas: Atlas; onStart: (id: string) => void; onPreview: (id: string | null) => void; initial?: string }) {
  const cols = atlas.config.journeyCollections ?? [];
  const byId = useMemo(() => new Map(atlas.events.map((e) => [e.id, e])), [atlas]);
  const evsOf = (j: Journey) => j.stops.map((s) => byId.get(s.event)!);
  const startOf = (j: Journey) => Math.min(...evsOf(j).map((e) => e.t0));
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [col, setCol] = useState(() => initial ?? cols[0]?.id ?? '');
  const [open, setOpen] = useState<string | null>(null);

  const query = q.trim().toLowerCase();
  const fits = (j: Journey) => {
    const evs = evsOf(j);
    if (period === 'roman' && !evs.some((e) => e.t0 < ROMAN_END)) return false;
    if (period === 'after' && !evs.some((e) => e.t0 >= ROMAN_END)) return false;
    if (!query) return true;
    return [j.title, j.intro, j.closing, ...evs.flatMap((e) => [e.title, e.place])].some((t) => t.toLowerCase().includes(query));
  };
  const all = useMemo(() => [...atlas.journeys].sort((a, b) => startOf(a) - startOf(b)), [atlas]);
  const shown = all.filter(fits);
  const known = new Set(cols.map((c) => c.id));
  const groups = [
    ...cols.map((c) => ({ ...c, journeys: shown.filter((j) => j.collection === c.id) })),
    { id: '', title: 'Other journeys', description: '', journeys: shown.filter((j) => !known.has(j.collection)) },
  ].filter((g) => g.id || g.journeys.length);
  // While searching, show every match; otherwise the chosen collection.
  const current = groups.find((g) => g.id === col) ?? groups[0];
  const list = query ? shown : (current?.journeys ?? []);
  const openJ = list.find((j) => j.id === open) ?? null;

  useEffect(() => onPreview(openJ?.id ?? null), [openJ?.id]);
  useEffect(() => () => onPreview(null), []);

  return (
    <aside className="panel journeys library" aria-label="Journeys">
      <header>
        <h2>Journeys</h2>
        <span className="count">{atlas.journeys.length} guided stories</span>
        <button className="close" onClick={() => store.set({ panel: null })} aria-label="Close">×</button>
        <div className="lib-tools">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a person, place or year" aria-label="Search journeys" />
          <div className="lib-period" role="group" aria-label="Period">
            {(['all', 'roman', 'after'] as Period[]).map((p) => (
              <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {p === 'all' ? 'All periods' : p === 'roman' ? 'Roman' : 'After Rome'}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="lib-body">
        <nav className="lib-cols" aria-label="Collections">
          {groups.map((g) => (
            <button key={g.id || 'other'} aria-current={!query && g.id === current?.id ? 'true' : undefined} onClick={() => { setQ(''); setCol(g.id); setOpen(null); }} disabled={!g.journeys.length}>
              <span>{g.title}</span>
              <span className="n">{g.journeys.length}</span>
            </button>
          ))}
        </nav>
        <section className="lib-list" aria-live="polite">
          {query ? (
            <p className="lib-note">{shown.length === 1 ? '1 journey matches' : `${shown.length} journeys match`} “{q.trim()}”</p>
          ) : (
            current && (
              <div className="lib-head">
                <h3>{current.title}</h3>
                {current.description && <p>{current.description}</p>}
              </div>
            )
          )}
          {!openJ && list.length > 0 && <p className="lib-note">Choose a journey to see its question, and where it begins and ends.</p>}
          {!list.length && <p className="lib-note">No journeys here for this period.</p>}
          <ol>
            {list.map((j) => {
              const evs = evsOf(j);
              const first = evs[0];
              const last = evs[evs.length - 1];
              const isOpen = j.id === openJ?.id;
              return (
                <li key={j.id} className={isOpen ? 'open' : undefined}>
                  <button className="lib-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : j.id)}>
                    <b>{j.title}</b>
                    <span>{j.stops.length} stops · {span(atlas, j)}</span>
                  </button>
                  {isOpen && (
                    <div className="lib-card">
                      <p className="lib-q">{paragraphs(j.intro)[0]}</p>
                      <dl className="lib-ends">
                        <div>
                          <dt>Begins</dt>
                          <dd>{first.title} <em>{formatShort(first.start, first.end, first.datePrecision)}</em></dd>
                        </div>
                        <div>
                          <dt>Ends</dt>
                          <dd>{last.title} <em>{formatShort(last.start, last.end, last.datePrecision)}</em></dd>
                        </div>
                      </dl>
                      <button className="primary" onClick={() => onStart(j.id)}>Begin the journey →</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
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
  const prev = step >= 2 && stop ? atlas.events.find((e) => e.id === journey.stops[step - 2].event) : undefined;
  return (
    <section className="journey-card" aria-label={`Journey: ${journey.title}`} aria-live="polite">
      <header>
        <span className="kicker">Journey · {summary ? 'Summary' : step === 0 ? `${n} stops` : `Stop ${step} of ${n}`}</span>
        <button className="close" onClick={onExit} aria-label="Leave journey">×</button>
        <h3>{journey.title}</h3>
        {journey.by && step === 0 && <p className="j-by">By {journey.by}</p>}
      </header>
      {ev && prev && (
        <p className="j-link">
          <b>{timeLink(prev, ev)}</b>{' '}
          <button onClick={() => onStep(step - 1)} title={`Back to stop ${step - 1}`}>{prev.title}</button>
          <span>, {placeLink(prev, ev)}:</span>
        </p>
      )}
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
          {stop && paragraphs(text).some((p) => section(p).label) && <span className="j-turning">One of the atlas’s 40 turning points</span>}
          {paragraphs(text).map((p, k) => {
            const sec = section(p);
            return sec.label ? (
              <div className="j-sec" key={k}>
                <h4>{sec.label}</h4>
                <p>{sec.text}</p>
              </div>
            ) : (
              <p key={k}>{p}</p>
            );
          })}
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
      {journey.closing && (
        <div className="j-closing">
          {paragraphs(journey.closing).map((p, k) => (
            <p key={k}>{p}</p>
          ))}
          <span className="synth" title="Written by the journey’s author; the evidence is in each event’s card">Journey author’s interpretation</span>
        </div>
      )}
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
            {i > 0 && (
              <span className="j-gap">
                {timeGap(evs[i - 1], e)} · {placeGap(evs[i - 1], e)}
              </span>
            )}
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
