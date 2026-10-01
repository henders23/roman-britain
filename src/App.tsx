import { useEffect, useMemo, useRef, useState } from 'react';
import { AtlasMap, type RegionInfo } from './map/AtlasMap';
import { loadAtlas, phaseAt, type Atlas, type AtlasEvent } from './data/dataset';
import { store, useAtlas } from './store';
import { Timeline } from './ui/Timeline';
import { EventPanel } from './ui/EventPanel';
import { About, Chronicle, Clock, Header, Headline, Legend, ThemeToggle } from './ui/Panels';
import { JourneyCard, JourneyList } from './ui/Journeys';
import { placeGap, timeGap } from './data/journey';
import { formatShort } from './data/time';
import { useTheme } from './theme';

const HEADLINE_SECONDS = 3.4;
// ?capture renders deterministic frames: no CSS animation, no easing.
const capture = new URLSearchParams(location.search).has('capture');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  useTheme();
  useEffect(() => {
    loadAtlas()
      .then((a) => {
        document.title = `${a.title}${a.subtitle ? ` · ${a.subtitle}` : ''} · UK Atlas`;
        store.set({ t: a.from });
        setAtlas(a);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  if (error) return <div className="boot-error"><h1>The atlas could not load</h1><pre>{error}</pre></div>;
  if (!atlas) return <div className="boot">Loading…</div>;
  return <AtlasView atlas={atlas} />;
}

function readHash(atlas: Atlas) {
  const h = new URLSearchParams(location.hash.slice(1));
  const t = Number(h.get('t'));
  const e = h.get('e');
  const j = h.get('j');
  return {
    t: h.has('t') && Number.isFinite(t) && t >= atlas.from && t <= atlas.to ? t : null,
    e: e && atlas.events.some((x) => x.id === e) ? e : null,
    j: j && atlas.journeys.some((x) => x.id === j) ? { id: j, step: Math.max(0, Number(h.get('s')) || 0) } : null,
  };
}

function AtlasView({ atlas }: { atlas: Atlas }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<AtlasMap | null>(null);
  const [ready, setReady] = useState(false);
  const [intro, setIntro] = useState(true);
  const [regionTip, setRegionTip] = useState<{ info: RegionInfo; x: number; y: number } | null>(null);
  const [evTip, setEvTip] = useState<{ ev: AtlasEvent; x: number; y: number } | null>(null);
  const [area, setArea] = useState(0);
  const selected = useAtlas((s) => s.selected);
  const headline = useAtlas((s) => s.headline);
  const panel = useAtlas((s) => s.panel);
  const playing = useAtlas((s) => s.playing);
  const theme = useAtlas((s) => s.theme);
  const t = useAtlas((s) => s.t);
  const journeyState = useAtlas((s) => s.journey);
  const journeyAuto = useAtlas((s) => s.journeyAuto);
  const journey = journeyState ? atlas.journeys.find((j) => j.id === journeyState.id) : undefined;
  const byId = useMemo(() => new Map(atlas.events.map((e) => [e.id, e])), [atlas]);
  // The playhead glides to each journey stop's date instead of jumping.
  const tween = useRef<{ from: number; to: number; start: number; dur: number } | null>(null);
  const glideTo = (to: number, dur = 1600) => {
    const from = store.get().t;
    tween.current = reduceMotion || capture ? null : { from, to, start: performance.now(), dur };
    if (!tween.current) store.set({ t: to });
  };
  const [interlude, setInterlude] = useState<{ key: number; time: string; place: string } | null>(null);
  const interludeTimer = useRef(0);
  const goStep = (id: string, step: number) => {
    const j = atlas.journeys.find((x) => x.id === id);
    if (!j) return;
    // Steps: 0 = introduction, 1..len = stops, len + 1 = the end-of-journey summary.
    const len = j.stops.length;
    const n = Math.max(0, Math.min(len + 1, step));
    const evs = j.stops.map((st) => byId.get(st.event)!);
    const from = store.get().journey?.id === id ? store.get().journey!.step : 0;
    // Moving on to the next stop: say how much time passes and how far the story moves.
    clearTimeout(interludeTimer.current);
    if (n === from + 1 && n >= 2 && n <= len) {
      setInterlude({ key: Date.now(), time: timeGap(evs[n - 2], evs[n - 1]), place: placeGap(evs[n - 2], evs[n - 1]) });
      interludeTimer.current = window.setTimeout(() => setInterlude(null), 3600);
    } else setInterlude(null);
    // The story thread joins the stops reached so far; the newest segment draws itself.
    const pts = j.thread === 'none' ? [] : evs.slice(0, n).map((e) => [e.lon, e.lat] as [number, number]);
    map.current?.setThread(pts, n === from + 1 && n <= len);
    store.set({ journey: { id, step: n }, panel: null, playing: false, headline: null });
    setIntro(false);
    if (n === 0) {
      store.set({ selected: null });
      // Start at the first stop's date, so the journey's first event is on the map.
      glideTo(evs[0].t0 + 0.001);
      map.current?.flyToEvents(evs);
    } else if (n > len) {
      // The summary: the whole thread, every stop in view.
      store.set({ selected: null });
      glideTo(Math.max(...evs.map((e) => e.t0)) + 0.001);
      map.current?.flyToEvents(evs);
    } else {
      const ev = evs[n - 1];
      glideTo(ev.t0 + 0.001);
      store.set({ selected: ev.id });
    }
  };
  const exitJourney = () => {
    store.set({ journey: null, journeyAuto: false });
    map.current?.setThread([], false);
    setInterlude(null);
  };
  const selEv = selected ? byId.get(selected) : undefined;
  const u = atlas.unit;

  // Map lifecycle.
  useEffect(() => {
    const base = `${import.meta.env.BASE_URL}geo/`;
    const a = new AtlasMap(mapEl.current!, atlas, base, store.get().theme);
    map.current = a;
    Object.assign(window, { __atlas: a, __store: store, __data: atlas });
    a.onReady = () => {
      setReady(true);
      setArea(a.focusArea(store.get().t));
    };
    a.onRegionHover = (info, p) => setRegionTip(info && p ? { info, x: p.x, y: p.y } : null);
    a.onEventHover = (ev, p) => setEvTip(ev && p ? { ev, x: p.x, y: p.y } : null);
    const { t: ht, e, j } = readHash(atlas);
    if (j) {
      setIntro(false);
      a.onReady = () => {
        setReady(true);
        setArea(a.focusArea(store.get().t));
        goStep(j.id, j.step);
      };
    } else if (e) {
      const ev = byId.get(e)!;
      store.set({ t: ev.t0 + 0.001, selected: e });
      setIntro(false);
    } else if (ht !== null) {
      store.set({ t: ht });
      setIntro(false);
    }
    const onResize = () => a.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      a.map.remove();
    };
  }, [atlas, byId]);

  useEffect(() => map.current?.setTheme(theme), [theme]);

  // The animation loop: advance time while playing, render the map every frame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let dwell = 0;
    let headlineUntil = 0;
    let prevT = store.get().t;
    let prevPhase = phaseAt(atlas.phases, prevT).id;
    let areaAt = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const s = store.get();
      let t = s.t;
      const tw = tween.current;
      if (tw && !s.playing) {
        const k = Math.min(1, (now - tw.start) / tw.dur);
        t = tw.from + (tw.to - tw.from) * (k * k * (3 - 2 * k));
        store.set({ t });
        if (k >= 1) tween.current = null;
      } else if (tw) tween.current = null;
      if (s.playing && !capture) {
        const slow = dwell > 0 ? 0.22 : 1;
        dwell = Math.max(0, dwell - dt);
        t = Math.min(atlas.to, t + dt * s.speed * u * slow);
        // Announce events as the playhead crosses them (or enters their date window).
        const crossed = atlas.events.filter((e) => e.t0 > prevT && e.t0 <= t && e.importance <= 2);
        if (crossed.length) {
          const top = crossed.sort((a, b) => a.importance - b.importance)[0];
          store.set({ headline: top.id });
          headlineUntil = now + HEADLINE_SECONDS * 1000;
          if (top.importance === 1) dwell = 1.4;
        }
        const ph = phaseAt(atlas.phases, t).id;
        if (ph !== prevPhase && s.autoCamera && !reduceMotion) map.current?.flyToPhase(t);
        prevPhase = ph;
        store.set({ t, playing: t < atlas.to });
      } else {
        prevPhase = phaseAt(atlas.phases, t).id;
      }
      if (s.headline && now > headlineUntil && !capture) store.set({ headline: null });
      prevT = t;
      // Screenshot tooling sets __freeze so software renderers can settle a frame.
      if (!(window as { __freeze?: boolean }).__freeze) map.current?.update(t);
      if (atlas.territory && now - areaAt > 120 && map.current) {
        areaAt = now;
        setArea(map.current.focusArea(t));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [atlas, u]);

  // Fly to a selected event and keep the URL shareable.
  useEffect(() => {
    if (selEv && ready && !capture) map.current?.flyToEvent(selEv);
  }, [selEv, ready]);
  useEffect(() => {
    if (playing) return;
    const h = journeyState ? `j=${journeyState.id}&s=${journeyState.step}` : selected ? `e=${selected}` : `t=${t.toFixed(2)}`;
    const id = setTimeout(() => history.replaceState(null, '', `${location.search}#${h}`), 250);
    return () => clearTimeout(id);
  }, [t, selected, playing, journeyState]);

  // Auto mode moves to the next stop after a pause long enough to read the stop's text.
  useEffect(() => {
    if (!journey || !journeyState || !journeyAuto) return;
    const n = journey.stops.length;
    if (journeyState.step > n) {
      store.set({ journeyAuto: false });
      return;
    }
    const text = journeyState.step === 0 ? journey.intro : journey.stops[journeyState.step - 1]?.text ?? '';
    const wait = Math.max(7000, 4000 + text.length * 45);
    const id = setTimeout(() => goStep(journey.id, journeyState.step + 1), wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey, journeyState, journeyAuto]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, dialog')) return;
      const s = store.get();
      const seek = (d: number) => store.set({ t: Math.max(atlas.from, Math.min(atlas.to, s.t + d)), playing: false });
      // Arrow keys step by a small and a large "beat" of this dataset's timeline.
      const small = u < 2 ? 1 / 12 : Math.max(1, Math.round(u / 4));
      const big = u < 2 ? 1 : Math.max(5, Math.round(u * 2));
      if (e.key === ' ') {
        e.preventDefault();
        store.set({ playing: !s.playing, selected: null });
        setIntro(false);
      } else if (e.key === 'ArrowRight') seek(e.shiftKey ? big : small);
      else if (e.key === 'ArrowLeft') seek(e.shiftKey ? -big : -small);
      else if (e.key === 'Home') seek(-Infinity);
      else if (e.key === 'End') seek(Infinity);
      else if ((e.key === ']' || e.key === '[') && s.journey) goStep(s.journey.id, s.journey.step + (e.key === ']' ? 1 : -1));
      else if (e.key === ']' || e.key === '[') {
        if (!atlas.events.length) return;
        const cur = s.selected ? byId.get(s.selected)!.index : atlas.events.filter((x) => x.t0 <= s.t).length - (e.key === ']' ? 1 : 0);
        const next = atlas.events[Math.max(0, Math.min(atlas.events.length - 1, cur + (e.key === ']' ? 1 : -1)))];
        store.set({ selected: next.id, t: next.t0 + 0.001, playing: false });
      } else if (e.key === 'Escape') {
        if (s.journey && !s.selected && !s.panel) store.set({ journey: null, journeyAuto: false });
        else store.set({ selected: null, panel: null });
      }
      else if (e.key.toLowerCase() === 'c') store.set({ panel: s.panel === 'chronicle' ? null : 'chronicle' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atlas, byId, u]);

  const seek = (tt: number) => {
    store.set({ t: tt });
    setIntro(false);
  };
  const begin = () => {
    setIntro(false);
    store.set({ t: atlas.from, playing: true, selected: null });
    map.current?.flyToPhase(atlas.from, 3200);
  };
  const headEv = headline ? byId.get(headline) : undefined;

  return (
    <div className={`app${capture ? ' capture' : ''}${selEv || panel === 'chronicle' || panel === 'journeys' ? ' has-panel' : ''}${journey ? ' in-journey' : ''}${ready ? ' ready' : ''}`}>
      <div className="map" ref={mapEl} />
      <div className="vignette" />
      <Header atlas={atlas} />
      <Clock atlas={atlas} areaKm2={area} />
      <nav className="tools">
        <button className={panel === 'chronicle' ? 'on' : ''} onClick={() => store.set({ panel: panel === 'chronicle' ? null : 'chronicle', selected: null })}>
          Chronicle
        </button>
        {atlas.journeys.length > 0 && (
          <button className={panel === 'journeys' || journey ? 'on' : ''} onClick={() => store.set({ panel: panel === 'journeys' ? null : 'journeys', selected: null })}>
            Journeys
          </button>
        )}
        <button onClick={() => store.set({ panel: 'about' })}>About</button>
        <label className="toggle" title="Follow the phases while playing">
          <input type="checkbox" defaultChecked onChange={(e) => store.set({ autoCamera: e.target.checked })} /> Follow
        </label>
        <ThemeToggle />
      </nav>
      {selEv ? <EventPanel ev={selEv} atlas={atlas} onClose={() => store.set({ selected: null })} /> : panel === 'chronicle' ? <Chronicle atlas={atlas} /> : panel === 'journeys' ? <JourneyList atlas={atlas} onStart={(id) => goStep(id, 0)} /> : null}
      {journey && interlude && (
        <div className="journey-interlude" key={interlude.key} aria-live="polite">
          <b>{interlude.time}</b>
          <span>{interlude.place}</span>
        </div>
      )}
      {journey && journeyState && <JourneyCard atlas={atlas} journey={journey} step={journeyState.step} onStep={(n) => goStep(journey.id, n)} onExit={exitJourney} />}
      {panel === 'about' && <About atlas={atlas} onClose={() => store.set({ panel: null })} />}
      {headEv && !selEv && !journey && <Headline ev={headEv} atlas={atlas} />}
      {!journey && <Legend atlas={atlas} />}
      <Timeline atlas={atlas} onSeek={seek} />
      {regionTip && !evTip && (
        <div className="tip region-tip" style={{ left: regionTip.x, top: regionTip.y }}>
          <b>{regionTip.info.name}</b>
          <span>
            <i className="sw" style={{ background: regionTip.info.polity.color }} />
            {regionTip.info.status === 'contested' ? 'Contested: ' : regionTip.info.status === 'vassal' ? 'Tributary to ' : ''}
            {regionTip.info.polity.name}
            {regionTip.info.since > atlas.from && <em> since {Math.floor(regionTip.info.since)}</em>}
          </span>
        </div>
      )}
      {evTip && (
        <div className="tip ev-tip" style={{ left: evTip.x, top: evTip.y }}>
          <b>{evTip.ev.title}</b>
          <span>{formatShort(evTip.ev.start, evTip.ev.end, evTip.ev.datePrecision)} · {evTip.ev.place}</span>
        </div>
      )}
      {intro && (
        <div className="intro">
          <div className="intro-card">
            <span className="kicker">UK Atlas{atlas.draft ? ' · draft' : ''}</span>
            <h1>{atlas.title}</h1>
            {atlas.subtitle && <p className="intro-dates">{atlas.subtitle}</p>}
            <p>
              Drag the timeline or press play. Every marker is an <i>include</i> row in round {atlas.pack.round} of the research pack ({atlas.events.length}{' '}
              {atlas.events.length === 1 ? 'event' : 'events'}); open one to see its sources and why it is on the map.
            </p>
            {atlas.draft && <p className="intro-draft">Draft: this pack has rows no one has checked yet. Treat everything here as provisional.</p>}
            <div className="intro-actions">
              <button className="primary" onClick={begin} disabled={!ready}>
                {ready ? 'Play the timeline' : 'Loading the map…'}
              </button>
              {atlas.journeys.length > 0 && (
                <button onClick={() => { setIntro(false); store.set({ panel: 'journeys' }); }}>Take a journey</button>
              )}
              <button onClick={() => setIntro(false)}>Explore freely</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
