import { useState } from 'react';
import { kindLabel, type Atlas, type AtlasEvent } from '../data/dataset';
import type { EventImage } from '../data/schema';
import { formatRange } from '../data/time';
import { store } from '../store';
import { Pin } from './Panels';

const CERTAINTY_TEXT: Record<string, string> = {
  high: 'Well attested',
  medium: 'Partly uncertain',
  low: 'Highly uncertain',
};

const LOCATION_TEXT: Record<string, string> = {
  exact: 'Location exact',
  approximate: 'Location approximate',
  uncertain: 'Location uncertain',
};

const GEOMETRY_TEXT: Record<string, string> = {
  city: 'Pinned to a named place',
  site: 'Pinned to a site',
  area: 'Drawn as a region: the sources support no single point',
};

const REVIEW_TEXT: Record<string, string> = {
  unverified: 'Unverified: no one has checked this row’s locators yet',
  checked: 'Checked: locators confirmed by one person',
  reconciled: 'Reconciled: checked by two people, conflicts resolved',
};

const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
const isPlaceholder = (s: string) => /^TO LOCATE\b/i.test(s);

function Source({ s }: { s: string }) {
  if (/^https?:\/\//.test(s))
    return (
      <a href={s} target="_blank" rel="noreferrer">
        {decodeURI(s).replace(/^https?:\/\//, '').slice(0, 80)}
      </a>
    );
  return <>{s}</>;
}

const COMMONS = 'https://commons.wikimedia.org/wiki/';

/** A picture from Wikimedia Commons, credited and linked to its file page. Hidden if it fails to load. */
function EventFigure({ image }: { image: EventImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const name = encodeURIComponent(image.file.replace(/ /g, '_'));
  const credit = [image.author, image.date].filter(Boolean).join(', ');
  return (
    <figure className="ev-figure">
      <a href={`${COMMONS}File:${name}`} target="_blank" rel="noreferrer" title="Open the file page on Wikimedia Commons">
        <img src={`${COMMONS}Special:FilePath/${name}?width=640`} alt={image.caption} loading="lazy" onError={() => setFailed(true)} />
      </a>
      <figcaption>
        {image.caption}
        <span>
          {credit && ` · ${credit}`} · {image.licence} · Wikimedia Commons
        </span>
      </figcaption>
    </figure>
  );
}

export function EventPanel({ ev, atlas, onClose }: { ev: AtlasEvent; atlas: Atlas; onClose: () => void }) {
  const i = ev.index;
  const prev = atlas.events[i - 1];
  const next = atlas.events[i + 1];
  const go = (e?: AtlasEvent) => e && store.set({ selected: e.id, t: e.t0 + 0.001, playing: false });
  const uncertain = ev.certainty !== 'high' || ev.locationCertainty !== 'exact';
  const primary = ev.sources.slice(0, ev.primaryCount);
  const secondary = ev.sources.slice(ev.primaryCount);
  const facets = [...(ev.facets ?? [])];
  if (atlas.config.magnitudeLabel && ev.magnitude !== undefined) facets.unshift({ label: atlas.config.magnitudeLabel, value: String(ev.magnitude) });
  const phase = atlas.phases.find((p) => p.id === ev.phase);

  return (
    <aside className="panel event-panel" aria-label={ev.title} key={ev.id}>
      <header>
        <div className="ev-kicker">
          <Pin atlas={atlas} kind={ev.kind} area={ev.geometry === 'area'} size={26} />
          <span>{kindLabel(atlas, ev.kind)}</span>
          {ev.reviewStatus === 'unverified' && <span className="ev-flag">Unverified</span>}
        </div>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>{ev.title}</h2>
        <p className="ev-when">
          <span>{formatRange(ev.start, ev.end, ev.datePrecision)}</span>
          <span className="dot">·</span>
          <span>{ev.place}</span>
        </p>
        {ev.windowed && <p className="ev-window-note">Dated to a window: it happened at some point in this span, not throughout it.</p>}
      </header>

      <div className="ev-body">
        {ev.image && <EventFigure image={ev.image} key={ev.image.file} />}
        <div className={`ev-certainty c-${ev.certainty}${uncertain ? ' is-uncertain' : ''}`}>
          <div className="cert-row">
            <span className="cert-meter" aria-hidden>
              <i /><i /><i />
            </span>
            <b>{CERTAINTY_TEXT[ev.certainty]}</b>
            <span className="cert-loc">{LOCATION_TEXT[ev.locationCertainty]}</span>
            <span className="cert-geo">
              {GEOMETRY_TEXT[ev.geometry]}
              {ev.geometry === 'area' && ev.radiusKm ? ` (radius ${ev.radiusKm} km)` : ''}
            </span>
          </div>
          {ev.uncertaintyNote && (
            <p className="cert-note">
              {uncertain && <span className="lbl">What is uncertain</span>}
              {ev.uncertaintyNote}
            </p>
          )}
          {uncertain && !ev.uncertaintyNote && <p className="cert-note">The pack gives no uncertainty note for this row.</p>}
        </div>

        {facets.length > 0 && (
          <dl className="ev-facets">
            {facets.map((f, k) => (
              <div key={k}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {ev.narrative === 'missing' ? (
          <div className="ev-no-narrative">
            <p className="lbl">No narrative yet</p>
            <p>
              This event has no narrative file (<code>narratives/{ev.id}.md</code>). The pack row describes it as:
            </p>
            <p className="ev-candidate">{ev.candidateDescription}</p>
          </div>
        ) : (
          <>
            {ev.narrative === 'placeholder' && <p className="ev-flag-line">This narrative is still a placeholder.</p>}
            <section className="ev-section">
              <h3 className="lbl">Summary</h3>
              {paragraphs(ev.summary).map((p, k) => (
                <p key={k} className="ev-summary">{p}</p>
              ))}
            </section>
            <section className="ev-section">
              <h3 className="lbl">Detail</h3>
              {paragraphs(ev.detail).map((p, k) => (
                <p key={k}>{p}</p>
              ))}
            </section>
            <section className="ev-section">
              <h3 className="lbl">Significance</h3>
              {paragraphs(ev.significance).map((p, k) => (
                <p key={k} className="ev-significance">{p}</p>
              ))}
            </section>
          </>
        )}

        {ev.merged.length > 0 && (
          <section className="ev-section ev-merged">
            <h3 className="lbl">Folded into this event</h3>
            <ul>
              {ev.merged.map((m) => (
                <li key={m.candidateId}>
                  {m.description} <span className="reason">{m.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="ev-sources">
          <h3 className="lbl">Sources</h3>
          <ol>
            {primary.map((s) => (
              <li key={s} className={`primary${isPlaceholder(s) ? ' placeholder' : ''}`}>
                <span className="src-tag">Primary</span> <Source s={s} />
              </li>
            ))}
            {secondary.map((s) => (
              <li key={s}>
                <Source s={s} />
              </li>
            ))}
          </ol>
          <p className="ev-reason">
            <span className="lbl">Why this is on the map</span>
            {ev.dispositionReason}
          </p>
          <p className="ev-row">
            {REVIEW_TEXT[ev.reviewStatus] ?? ev.reviewStatus}. Rights: {ev.rightsStatus}. Pack row <code>{ev.sourceRow}</code>, {atlas.pack.file}
            {phase ? `. Phase: ${phase.title}` : ''}.
          </p>
        </section>
      </div>

      <footer>
        <button disabled={!prev} onClick={() => go(prev)}>← {prev ? prev.title : ''}</button>
        <button disabled={!next} onClick={() => go(next)}>{next ? next.title : ''} →</button>
      </footer>
    </aside>
  );
}
