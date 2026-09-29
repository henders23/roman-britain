import { useEffect, useMemo, useRef, useState } from 'react';
import { phaseEnd, type Atlas, type AtlasEvent } from '../data/dataset';
import { store, useAtlas } from '../store';
import { formatClock, formatShort, formatYear } from '../data/time';

const SPEEDS = [0.5, 1, 2, 4];
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

export function Timeline({ atlas, onSeek }: { atlas: Atlas; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; t: number; ev?: AtlasEvent } | null>(null);
  const t = useAtlas((s) => s.t);
  const playing = useAtlas((s) => s.playing);
  const speed = useAtlas((s) => s.speed);
  const selected = useAtlas((s) => s.selected);
  const journeyState = useAtlas((s) => s.journey);
  const journey = journeyState ? atlas.journeys.find((j) => j.id === journeyState.id) : undefined;
  const withMonth = atlas.to - atlas.from <= 200;

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 14;
  const x = (y: number) => pad + ((y - atlas.from) / (atlas.to - atlas.from)) * (width - pad * 2);
  const toT = (px: number) => Math.max(atlas.from, Math.min(atlas.to, atlas.from + ((px - pad) / (width - pad * 2)) * (atlas.to - atlas.from)));

  // Year ticks at a round step that leaves room for their labels.
  const ticks = useMemo(() => {
    const labelPx = 46;
    const perYear = (width - pad * 2) / (atlas.to - atlas.from);
    const step = STEPS.find((s) => s * perYear >= labelPx) ?? 1000;
    const out: number[] = [];
    for (let y = Math.ceil(atlas.from / step) * step; y <= atlas.to; y += step) out.push(y);
    return out;
  }, [atlas, width]);

  // Stack ticks that would overlap into lanes so every event stays clickable.
  const lanes = useMemo(() => {
    const lastX: number[] = [];
    return atlas.events.map((e) => {
      const px = x(e.t0);
      let lane = 0;
      while (lastX[lane] !== undefined && px - lastX[lane] < 5) lane++;
      lastX[lane] = e.windowed ? Math.max(px, x(e.t1)) : px;
      return Math.min(lane, 3);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, width]);

  // An event is under the pointer if the pointer is on its tick, or anywhere in its window.
  const eventAt = (px: number) =>
    atlas.events
      .filter((e) => Math.abs(x(e.t0) - px) < 5 || (e.windowed && px >= x(e.t0) - 3 && px <= x(e.t1) + 3))
      .sort((a, b) => Number(!!a.windowed) - Number(!!b.windowed) || a.importance - b.importance)[0];

  const drag = useRef(false);
  const onPointer = (ev: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    if (ev.type === 'pointerdown') {
      drag.current = true;
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      store.set({ playing: false });
    }
    const tt = toT(px);
    if (drag.current) onSeek(tt);
    setHover({ x: px, t: tt, ev: eventAt(px) });
    if (ev.type === 'pointerup') drag.current = false;
  };

  const phaseY = 0;
  const evY = 30;
  const h = 78;
  const clock = formatClock(t, withMonth);

  return (
    <div className="timeline">
      <div className="tl-controls">
        <button
          className="play"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            const s = store.get();
            if (!s.playing && s.t >= atlas.to - atlas.unit * 0.05) onSeek(atlas.from);
            store.set({ playing: !s.playing, selected: s.playing ? s.selected : null });
          }}
        >
          {playing ? (
            <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></svg>
          )}
        </button>
        <button className="speed" aria-label="Playback speed" title={`${Math.round(atlas.unit * speed * 10) / 10} years per second`} onClick={() => store.set({ speed: SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] })}>
          {speed}×
        </button>
      </div>
      <div
        className="tl-track"
        ref={ref}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
        onPointerLeave={() => !drag.current && setHover(null)}
        onClick={() => hover?.ev && store.set({ selected: hover.ev.id })}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={atlas.from}
        aria-valuemax={atlas.to}
        aria-valuenow={Math.round(t * 100) / 100}
        aria-valuetext={clock.label}
        tabIndex={0}
      >
        <svg width={width} height={h}>
          <defs>
            <linearGradient id="played" x1="0" x2="1">
              <stop offset="0" className="played-a" />
              <stop offset="1" className="played-b" />
            </linearGradient>
          </defs>
          {atlas.phases.map((p, i) => {
            const a = x(Math.max(p.from, atlas.from));
            const b = x(Math.min(phaseEnd(p), atlas.to));
            const on = t >= p.from && t < phaseEnd(p);
            return (
              <g key={p.id} className={`tl-phase${on ? ' on' : ''}`}>
                <rect x={a} y={phaseY} width={Math.max(0, b - a - 1)} height={20} rx={3} className={i % 2 ? 'odd' : ''} />
                {b - a > 58 && (
                  <text x={a + 6} y={phaseY + 14}>
                    {p.title.length * 5.6 > b - a - 10 ? p.title.slice(0, Math.floor((b - a - 16) / 5.6)) + '…' : p.title}
                  </text>
                )}
              </g>
            );
          })}
          <rect x={pad} y={evY - 4} width={Math.max(0, x(t) - pad)} height={40} fill="url(#played)" />
          {atlas.events.map((e, i) => {
            const hh = 8 + (4 - e.importance) * 5;
            const y0 = evY + 30 - hh - lanes[i] * 2;
            const isSel = e.id === selected;
            if (e.windowed) {
              // A date window: faint across the whole window, full strength only while the
              // playhead is inside it. It is a window, not a duration.
              const inside = t >= e.t0 && t <= e.t1;
              const a = x(e.t0);
              const w = Math.max(3, x(e.t1) - a);
              return (
                <g key={e.id} className={`tl-window${inside ? ' inside' : ''}${isSel ? ' sel' : ''}`}>
                  <rect x={a} y={y0} width={w} height={hh} rx={1.5} className="win-fill" />
                  <line x1={a + 0.5} x2={a + 0.5} y1={y0} y2={y0 + hh} className="win-cap" />
                  <line x1={a + w - 0.5} x2={a + w - 0.5} y1={y0} y2={y0 + hh} className="win-cap" />
                </g>
              );
            }
            const on = t >= e.t0;
            const dur = e.end ? Math.max(2.5, x(e.t1) - x(e.t0)) : 0;
            return (
              <rect
                key={e.id}
                x={x(e.t0) - 1.25}
                y={y0}
                width={dur || (isSel ? 3.5 : 2.5)}
                height={hh}
                rx={1}
                className={`tl-tick${on ? ' on' : ''}${isSel ? ' sel' : ''}${e.geometry === 'area' ? ' tick-area' : ''}`}
              />
            );
          })}
          {ticks.map((y) => (
            <g key={y} className="tl-year">
              <line x1={x(y)} x2={x(y)} y1={evY + 31} y2={evY + 35} />
              <text x={x(y)} y={evY + 45} textAnchor="middle">{formatYear(y)}</text>
            </g>
          ))}
          {journey?.stops.map((st, i) => {
            const ev = atlas.events.find((e) => e.id === st.event);
            if (!ev) return null;
            return (
              <g key={st.event} className={`tl-jstop${journeyState?.step === i + 1 ? ' on' : ''}`} transform={`translate(${x(ev.t0)},${evY - 1})`}>
                <circle r={6.5} />
                <text textAnchor="middle" y={3}>{i + 1}</text>
              </g>
            );
          })}
          <g className="tl-head" transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={h - 2} />
            <circle cy={evY + 31} r={6} />
          </g>
          {hover && <line className="tl-hover" x1={hover.x} x2={hover.x} y1={4} y2={h - 4} />}
        </svg>
        {hover && (
          <div className="tl-tip" style={{ left: Math.max(90, Math.min(width - 90, hover.x)) }}>
            {hover.ev ? (
              <>
                <b>{hover.ev.title}</b>
                <span>{formatShort(hover.ev.start, hover.ev.end, hover.ev.datePrecision)}</span>
              </>
            ) : (
              <span>{formatClock(hover.t, withMonth).label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
