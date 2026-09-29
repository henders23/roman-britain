import { useEffect, useMemo, useRef, useState } from 'react';
import { DATASET_LIST, isFocus, kindLabel, phaseAt, storyOf, type Atlas, type AtlasEvent } from '../data/dataset';
import { formatClock, formatShort } from '../data/time';
import { glyphFor, pinDataUrl } from '../map/icons';
import { store, useAtlas } from '../store';
import { setThemePref, useThemePref } from '../theme';

/** The pin artwork for an event (or a kind) as an <img>, redrawn when the theme changes. */
export function Pin({ atlas, kind, area = false, size = 22 }: { atlas: Atlas; kind: string; area?: boolean; size?: number }) {
  const theme = useAtlas((s) => s.theme);
  const src = useMemo(() => pinDataUrl(glyphFor(kind, atlas.kinds.get(kind)?.icon), area, theme), [atlas, kind, area, theme]);
  return <img src={src} alt="" width={size} height={size} />;
}

export function Header({ atlas }: { atlas: Atlas }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  const many = DATASET_LIST.length > 1;
  const pick = (slug: string) => {
    const q = new URLSearchParams(location.search);
    q.set('d', slug);
    location.assign(`${location.pathname}?${q}`);
  };
  return (
    <div className="header" ref={ref}>
      <button className="set-pick" onClick={() => many && setOpen(!open)} aria-expanded={many ? open : undefined} aria-haspopup={many ? 'listbox' : undefined} disabled={!many}>
        <span className="kicker">
          UK Atlas
          {atlas.draft && <span className="draft-badge" title="The dev server shows unverified rows. A production build refuses them.">Draft · {atlas.pack.round}</span>}
        </span>
        <span className="set-title">
          {atlas.title} <small>{atlas.subtitle}</small>
          {many && <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>}
        </span>
      </button>
      {open && (
        <ul className="set-menu" role="listbox">
          {DATASET_LIST.map((d) => (
            <li key={d.slug} role="option" aria-selected={d.slug === atlas.slug} className={d.slug === atlas.slug ? 'on' : ''} onClick={() => (d.slug === atlas.slug ? setOpen(false) : pick(d.slug))}>
              <b>{d.title}</b>
              <span>{d.subtitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Clock({ atlas, areaKm2 }: { atlas: Atlas; areaKm2: number }) {
  const t = useAtlas((s) => s.t);
  const clock = formatClock(t, atlas.to - atlas.from <= 200);
  const phase = phaseAt(atlas.phases, t);
  const chapter = atlas.phases.indexOf(phase) + 1;
  const story = storyOf(phase);
  const onMap = atlas.events.filter((e) => e.t0 <= t).length;
  return (
    <div className="clock" aria-live="off">
      {clock.month && <div className="clock-month">{clock.month}</div>}
      <div className="clock-year">
        {clock.era === 'AD' && <span className="era">AD</span>}
        {clock.year}
        {clock.era === 'BC' && <span className="era">BC</span>}
      </div>
      <div className="clock-meta">
        {atlas.territory ? (
          <span>
            <AnimatedNumber value={areaKm2 / 1e6} digits={2} /> M km² {atlas.territory.focusLabel}
          </span>
        ) : (
          <span>
            <b className="num">{onMap}</b> of {atlas.events.length} events reached
          </span>
        )}
      </div>
      <div className="chapter" key={phase.id}>
        <span className="chapter-n">Chapter {chapter} of {atlas.phases.length}</span>
        <h3>{phase.title}</h3>
        {story ? (
          <p>
            {story} <span className="synth" title="Written for the atlas; not a claim made by the research pack">Atlas synthesis</span>
          </p>
        ) : (
          atlas.draft && <p className="story-missing">No chapter story written yet.</p>
        )}
      </div>
    </div>
  );
}

const CAPTURE = new URLSearchParams(location.search).has('capture');

function AnimatedNumber({ value, digits }: { value: number; digits: number }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      cur.current += (value - cur.current) * (CAPTURE ? 1 : 0.18);
      if (Math.abs(value - cur.current) < 0.005) cur.current = value;
      setShown(cur.current);
      if (cur.current !== value) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <b className="num">{shown.toFixed(digits)}</b>;
}

export function Chronicle({ atlas }: { atlas: Atlas }) {
  const t = useAtlas((s) => s.t);
  const selected = useAtlas((s) => s.selected);
  const [q, setQ] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const current = useMemo(() => {
    let idx = -1;
    for (const e of atlas.events) if (e.t0 <= t) idx = e.index;
    return idx;
  }, [t, atlas]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? atlas.events.filter((e) => (e.title + ' ' + e.place + ' ' + e.summary + ' ' + kindLabel(atlas, e.kind)).toLowerCase().includes(s)) : atlas.events;
  }, [q, atlas]);
  useEffect(() => {
    if (q) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${current}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current, q]);
  let lastPhase = '';
  return (
    <aside className="panel chronicle" aria-label="Chronicle of events">
      <header>
        <h2>Chronicle</h2>
        <span className="count">{atlas.events.length} events</span>
        <button className="close" onClick={() => store.set({ panel: null })} aria-label="Close">×</button>
        <input type="search" placeholder="Search places, sites, finds…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
      </header>
      <ol ref={list}>
        {filtered.map((e) => {
          const ph = atlas.phases.find((p) => p.id === e.phase);
          const heading = !q && ph && ph.id !== lastPhase ? ph : null;
          if (heading) lastPhase = heading.id;
          return (
            <li key={e.id} data-i={e.index} className={`${e.t0 <= t ? 'past' : 'future'}${e.index === current ? ' now' : ''}${e.id === selected ? ' sel' : ''}`}>
              {heading && <h4>{heading.title}</h4>}
              <button onClick={() => store.set({ selected: e.id, t: e.t0 + 0.001, playing: false })}>
                <Pin atlas={atlas} kind={e.kind} area={e.geometry === 'area'} />
                <span className="c-date">{formatShort(e.start, e.end, e.datePrecision)}</span>
                <span className="c-title">{e.title}</span>
                {e.importance === 1 && <span className="c-star" aria-label="major">✦</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export function Legend({ atlas }: { atlas: Atlas }) {
  const [open, setOpen] = useState(false);
  const T = atlas.territory;
  const used = new Set(atlas.events.map((e) => e.kind));
  const kinds = atlas.config.kinds.filter((k) => used.has(k.id));
  const anyKind = kinds[0]?.id ?? 'dot';
  return (
    <div className={`legend${open ? ' open' : ''}`}>
      <button className="legend-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Key
      </button>
      {open && (
        <div className="legend-body">
          {T && (
            <div className="lg-group">
              {[...T.polities.values()].filter(isFocus).map((p) => (
                <div key={p.id} className="lg-row"><i className="sw" style={{ background: p.color }} /> {p.name}</div>
              ))}
              <div className="lg-row"><i className="sw sw-other" /> Other polities</div>
              <div className="lg-row"><i className="sw sw-vassal" /> Tributary</div>
              <div className="lg-row"><i className="sw sw-contested" /> Contested</div>
              <div className="lg-row lg-note">Territory is atlas synthesis</div>
            </div>
          )}
          <div className="lg-group">
            <div className="lg-row"><Pin atlas={atlas} kind={anyKind} size={18} /> Pin: a named place or site</div>
            <div className="lg-row"><Pin atlas={atlas} kind={anyKind} area size={18} /> Dashed: a region, no single point</div>
            <div className="lg-row"><i className="win-key" /> Dotted ring or faint bar: dated to a window</div>
            <div className="lg-row"><i className="dotc" /> Small dot: earlier event</div>
            <div className="lg-row">{atlas.config.magnitudeLabel ? `Pin size: ${atlas.config.magnitudeLabel}` : 'Pin size: importance in the pack'}</div>
          </div>
          <div className="lg-group lg-kinds">
            {kinds.map((k) => (
              <div key={k.id} className="lg-row"><Pin atlas={atlas} kind={k.id} size={18} /> {k.label}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Headline({ ev, atlas }: { ev: AtlasEvent; atlas: Atlas }) {
  return (
    <button className="headline" key={ev.id} onClick={() => store.set({ selected: ev.id, playing: false })}>
      <Pin atlas={atlas} kind={ev.kind} area={ev.geometry === 'area'} size={30} />
      <span>
        <b>{ev.title}</b>
        <em>
          {formatShort(ev.start, ev.end, ev.datePrecision)} · {ev.place}
          {ev.summary ? ` · ${ev.summary}` : ''}
        </em>
      </span>
    </button>
  );
}

export function ThemeToggle() {
  const pref = useThemePref();
  const next = pref === 'auto' ? 'light' : pref === 'light' ? 'dark' : 'auto';
  const label = pref === 'auto' ? 'Auto' : pref === 'light' ? 'Light' : 'Dark';
  return (
    <button className="theme-btn" onClick={() => setThemePref(next)} title={`Theme: ${label}. Click for ${next}.`} aria-label={`Theme: ${label}`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
      </svg>
      <span className="theme-name">{label}</span>
    </button>
  );
}

export function About({ atlas, onClose }: { atlas: Atlas; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const n = (g: string) => atlas.events.filter((e) => e.geometry === g).length;
  const windows = atlas.events.filter((e) => e.windowed).length;
  const p = atlas.pack;
  return (
    <dialog ref={ref} className="about" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <button className="close" onClick={() => ref.current?.close()} aria-label="Close">×</button>
      <h2>About this atlas</h2>
      <p className="synth-note">
        This panel is the atlas’s own description, not a claim made by the research pack. So are the chapter stories.
      </p>
      <p>
        {atlas.title}{atlas.subtitle ? `, ${atlas.subtitle}` : ''}. Drag the timeline or press play; click any marker for the event behind it and the
        evidence for it.
      </p>
      <h3>Where the markers come from</h3>
      <p>
        Every marker is a row marked <i>include</i> in round {p.round} of the research pack ({p.file}: {p.rows} candidate rows, {p.include} included,{' '}
        {p.merged.length} merged into other events, {p.excluded.length} excluded). The pack decides how precisely each event may be drawn: {n('city') + n('site')}{' '}
        {n('city') + n('site') === 1 ? 'is' : 'are'} pinned to a named place or site, and {n('area')} {n('area') === 1 ? 'is' : 'are'} drawn as a dashed region because the
        sources support a region but not a point. Each card lists the pack’s primary locators first and says why the row was included.
      </p>
      <p>
        {windows} {windows === 1 ? 'event is' : 'events are'} dated only to a window of years. On the timeline a window is a faint bar, and on the map a dotted ring,
        at full strength only while the playhead is inside it. A window says when something happened, not how long it lasted.
      </p>
      {atlas.draft && (
        <p className="intro-draft">
          Draft: you are looking at the development build, which shows rows no one has checked yet ({p.unverified.filter((r) => r.disposition === 'include').length} of {p.include} included rows are unverified).
          A production build refuses to run until every included row has been checked.
        </p>
      )}
      {(p.excluded.length > 0 || p.merged.length > 0) && (
        <>
          <h3>Left off the map</h3>
          <ul className="left-off">
            {p.excluded.map((r) => (
              <li key={r.candidateId}>
                <b>Excluded:</b> {r.description} <span className="reason">{r.reason}</span>
              </li>
            ))}
            {p.merged.map((r) => (
              <li key={r.candidateId}>
                <b>Merged into {atlas.events.find((e) => e.id === r.target)?.title ?? r.target}:</b> {r.description} <span className="reason">{r.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {atlas.territory && (
        <>
          <h3>What the colours are</h3>
          <p>{atlas.territory.note} <span className="synth">Atlas synthesis</span></p>
        </>
      )}
      <h3>Not drawn</h3>
      <p>Routes, roads and linear monuments are not drawn. The atlas draws only points and regions that the pack supports.</p>
      <h3>Keyboard</h3>
      <p className="keys">
        <kbd>Space</kbd> play or pause · <kbd>←</kbd> <kbd>→</kbd> step · <kbd>Shift</kbd>+<kbd>←</kbd> <kbd>→</kbd> larger step ·{' '}
        <kbd>[</kbd> <kbd>]</kbd> previous or next event · <kbd>C</kbd> chronicle · <kbd>Esc</kbd> close
      </p>
      <h3>Credits</h3>
      <p className="credits">
        Built on an open-source atlas engine (MIT licence). Relief from AWS Terrain Tiles (Mapzen, SRTM, ETOPO1, GMTED). Rivers and lakes from Natural Earth.
        Rendered with MapLibre GL.
      </p>
    </dialog>
  );
}
