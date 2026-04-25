import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, ExternalLink, FileCode2, LocateFixed, MapPinned, MessageSquareText, RefreshCcw, Save, Search, Sparkles } from 'lucide-react';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './GuideMapEditorPanel.css';

type GuidePlace = {
  id: string;
  name: string;
  shortName?: string;
  type: string;
  coords: [number, number];
  subtitle?: string;
  region?: string;
  sector?: string;
  desc?: string;
  link?: string;
  googleMaps?: string;
  starHolonId?: string;
  localStats?: Record<string, number>;
};

type DraftPlace = {
  id: string;
  name: string;
  shortName: string;
  type: string;
  lng: string;
  lat: string;
  link: string;
  starHolonId: string;
  desc: string;
};

type MapCenter = {
  coords: [number, number];
  zoom: number;
};

const GUIDE_DIR = 'OASIS-IDE/public/guide-map';
const MAP_FILE = 'oasis-ide-guide-map.html';
const DATA_FILE = 'oasis-ide-guide-places.js';
const DEFAULT_TYPE = 'holon';
const PLACE_TYPES = [
  { value: 'holon', label: 'Holon' },
  { value: 'business', label: 'Business / Website' },
  { value: 'geonft', label: 'GeoNFT' },
  { value: 'project', label: 'Project / OAPP' },
  { value: 'conservation', label: 'Conservation / Place' },
  { value: 'anchor', label: 'Region Anchor' }
];

function joinPath(base: string, ...parts: string[]): string {
  return [base.replace(/\/+$/, ''), ...parts.map((p) => p.replace(/^\/+|\/+$/g, ''))].join('/');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function readPlacesFromSource(source: string): GuidePlace[] {
  const sandbox: { OASIS_IDE_GUIDE_PLACES?: unknown } = {};
  const result = Function(
    'window',
    `"use strict";\n${source}\nreturn window.OASIS_IDE_GUIDE_PLACES;`
  )(sandbox) as unknown;
  if (!Array.isArray(result)) {
    throw new Error(`${DATA_FILE} did not define window.OASIS_IDE_GUIDE_PLACES.`);
  }
  return result.filter((p): p is GuidePlace => {
    const maybe = p as Partial<GuidePlace>;
    return (
      typeof maybe.id === 'string' &&
      typeof maybe.name === 'string' &&
      typeof maybe.type === 'string' &&
      Array.isArray(maybe.coords) &&
      maybe.coords.length === 2
    );
  });
}

function writePlacesSource(places: GuidePlace[]): string {
  return [
    '// OASIS IDE editable place registry for oasis-ide-guide-map.html.',
    '// This file is rewritten by the OASIS IDE Guide Map panel.',
    `window.OASIS_IDE_GUIDE_PLACES = ${JSON.stringify(places, null, 2)};`,
    ''
  ].join('\n');
}

function emptyDraft(coords?: [number, number]): DraftPlace {
  return {
    id: '',
    name: '',
    shortName: '',
    type: DEFAULT_TYPE,
    lng: coords ? String(coords[0]) : '',
    lat: coords ? String(coords[1]) : '',
    link: '',
    starHolonId: '',
    desc: ''
  };
}

function placeToDraft(place: GuidePlace): DraftPlace {
  return {
    id: place.id,
    name: place.name,
    shortName: place.shortName || place.name.slice(0, 18),
    type: place.type || DEFAULT_TYPE,
    lng: String(place.coords[0]),
    lat: String(place.coords[1]),
    link: place.link || '',
    starHolonId: place.starHolonId || '',
    desc: place.desc || ''
  };
}

function coordsFromDraft(draft: DraftPlace): [number, number] | null {
  const lng = Number(draft.lng);
  const lat = Number(draft.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

function draftToPlace(draft: DraftPlace): GuidePlace {
  const lng = Number(draft.lng);
  const lat = Number(draft.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('Longitude and latitude must be valid numbers.');
  }
  const id = (draft.id.trim() || slugify(draft.name)).slice(0, 64);
  if (!id || !draft.name.trim()) {
    throw new Error('A place needs a name and id.');
  }

  const place: GuidePlace = {
    id,
    name: draft.name.trim(),
    shortName: draft.shortName.trim() || draft.name.trim().slice(0, 18),
    type: draft.type.trim() || DEFAULT_TYPE,
    coords: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
    desc: draft.desc.trim() || `Draft location added from OASIS IDE Guide Map.`
  };
  if (draft.link.trim()) place.link = draft.link.trim();
  if (draft.starHolonId.trim()) place.starHolonId = draft.starHolonId.trim();
  return place;
}

export const GuideMapEditorPanel: React.FC = () => {
  const { workspacePath, openFile, refreshTree } = useWorkspace();
  const { addReference, injectComposerDraft } = useIdeChat();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [places, setPlaces] = useState<GuidePlace[]>([]);
  const [draft, setDraft] = useState<DraftPlace>(() => emptyDraft());
  const [previewUrl, setPreviewUrl] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<MapCenter | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const paths = useMemo(() => {
    if (!workspacePath) return null;
    const guideDir = joinPath(workspacePath, GUIDE_DIR);
    return {
      guideDir,
      mapPath: joinPath(guideDir, MAP_FILE),
      dataPath: joinPath(guideDir, DATA_FILE)
    };
  }, [workspacePath]);

  const loadPlaces = useCallback(async (): Promise<GuidePlace[]> => {
    if (!paths) return [];
    const raw = await window.electronAPI?.readFile(paths.dataPath);
    if (!raw) throw new Error(`Could not read ${GUIDE_DIR}/${DATA_FILE}.`);
    const next = readPlacesFromSource(raw);
    setPlaces(next);
    return next;
  }, [paths]);

  const startPreview = useCallback(async () => {
    if (!paths) return;
    setError('');
    try {
      await loadPlaces();
      const result = await window.electronAPI?.previewStaticFolder(paths.guideDir, false);
      if (!result || !result.ok) {
        throw new Error(result?.error ?? 'Could not start static preview.');
      }
      setPreviewUrl(`${result.url}${MAP_FILE}`);
      setStatus(`Preview running on port ${result.port}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadPlaces, paths]);

  useEffect(() => {
    void startPreview();
  }, [startPreview]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; coords?: unknown; place?: unknown; zoom?: unknown };
      if (data?.source !== 'oasis-ide-guide-map') return;
      if (data.type === 'map-center') {
        if (!Array.isArray(data.coords) || data.coords.length !== 2) return;
        const lng = Number(data.coords[0]);
        const lat = Number(data.coords[1]);
        const zoom = Number(data.zoom);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          setMapCenter({ coords: [lng, lat], zoom: Number.isFinite(zoom) ? zoom : 0 });
        }
        return;
      }
      if (data.type === 'place-select') {
        const place = data.place as GuidePlace;
        if (place?.id && Array.isArray(place.coords)) {
          setDraft(placeToDraft(place));
          setStatus(`Loaded ${place.name} into the editor.`);
        }
        return;
      }
      if (data.type === 'map-click') {
        if (!Array.isArray(data.coords) || data.coords.length !== 2) return;
        const lng = Number(data.coords[0]);
        const lat = Number(data.coords[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        setDraft((d) => ({ ...d, lng: String(lng), lat: String(lat) }));
        setStatus(`Draft coordinates set from map click: ${lng}, ${lat}.`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const updateDraft = (key: keyof DraftPlace, value: string) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === 'name' && !d.id) next.id = slugify(value);
      if (key === 'name' && !d.shortName) next.shortName = value.slice(0, 18);
      return next;
    });
  };

  const postToMap = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: 'oasis-ide-guide-panel', ...message },
      '*'
    );
  }, []);

  useEffect(() => {
    const coords = coordsFromDraft(draft);
    if (!coords) return;
    postToMap({ type: 'draft-marker', coords });
  }, [draft.lng, draft.lat, postToMap]);

  const focusDraftOnMap = () => {
    const coords = coordsFromDraft(draft);
    if (!coords) {
      setError('Add valid longitude and latitude first.');
      return;
    }
    setError('');
    postToMap({ type: 'focus-coords', coords, zoom: 14 });
  };

  const useMapCenter = () => {
    if (!mapCenter) {
      setError('Move the map first, then use the current center.');
      return;
    }
    setError('');
    setDraft((d) => ({
      ...d,
      lng: String(mapCenter.coords[0]),
      lat: String(mapCenter.coords[1])
    }));
    postToMap({ type: 'draft-marker', coords: mapCenter.coords });
    setStatus(`Draft coordinates set from map center at zoom ${mapCenter.zoom}.`);
  };

  const searchLocation = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    setError('');
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Search failed (${response.status}).`);
      const results = (await response.json()) as Array<{ display_name?: string; lon?: string; lat?: string }>;
      const hit = results[0];
      if (!hit?.lon || !hit.lat) throw new Error('No location found.');
      const coords: [number, number] = [Number(hit.lon), Number(hit.lat)];
      if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) throw new Error('Search returned invalid coordinates.');
      setDraft((d) => ({
        ...d,
        name: d.name || query,
        id: d.id || slugify(query),
        shortName: d.shortName || query.slice(0, 18),
        lng: String(Number(coords[0].toFixed(6))),
        lat: String(Number(coords[1].toFixed(6)))
      }));
      postToMap({ type: 'focus-coords', coords, zoom: 14 });
      setStatus(`Found ${hit.display_name || query}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  const saveDraft = async () => {
    if (!paths) return;
    setError('');
    try {
      const nextPlace = draftToPlace(draft);
      const current = await loadPlaces();
      const replaced = current.some((p) => p.id === nextPlace.id);
      const nextPlaces = replaced
        ? current.map((p) => (p.id === nextPlace.id ? { ...p, ...nextPlace } : p))
        : [...current, nextPlace];
      await window.electronAPI?.writeFile(paths.dataPath, writePlacesSource(nextPlaces));
      setPlaces(nextPlaces);
      setStatus(`${replaced ? 'Updated' : 'Added'} ${nextPlace.name}.`);
      setDraft(emptyDraft());
      setReloadKey((k) => k + 1);
      await refreshTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const draftHolonPrompt = (kind: 'holon' | 'geonft') => {
    if (!paths) return;
    const place = draftToPlace(draft);
    addReference(paths.dataPath);
    if (kind === 'holon') {
      injectComposerDraft(
        `Create or link a STARNET business/place holon for this OASIS IDE Guide Map location.\n\n` +
          `Place JSON:\n${JSON.stringify(place, null, 2)}\n\n` +
          `Use existing STAR/OASIS MCP tools where available. Ask before any irreversible on-chain action. After creating or finding the record, update \`${GUIDE_DIR}/${DATA_FILE}\` with the returned holon id.`
      );
      return;
    }
    injectComposerDraft(
      `Drop a GeoNFT at this OASIS IDE Guide Map location.\n\n` +
        `Place JSON:\n${JSON.stringify(place, null, 2)}\n\n` +
        `Use existing OASIS/STARNET MCP tools where available. First explain the intended mint/drop operation in plan mode, then ask for confirmation before doing anything irreversible. Attach the resulting asset/transaction identifiers and update \`${GUIDE_DIR}/${DATA_FILE}\`.`
    );
  };

  const canUseDraft = draft.name.trim() && draft.lng.trim() && draft.lat.trim();
  const iframeSrc = previewUrl ? `${previewUrl}?ide=${reloadKey}` : '';

  return (
    <section className="gm-panel">
      <header className="gm-topbar">
        <div className="gm-title">
          <MapPinned size={17} />
          <div>
            <strong>OASIS IDE Guide Map</strong>
            <span>Visual location picker plus agent-guided Composer actions</span>
          </div>
        </div>
        <button type="button" className="gm-btn" onClick={startPreview}>
          <RefreshCcw size={14} /> Refresh Preview
        </button>
        {previewUrl ? (
          <button type="button" className="gm-btn" onClick={() => window.electronAPI?.openUrl(previewUrl)}>
            <ExternalLink size={14} /> Browser
          </button>
        ) : null}
      </header>

      <div className="gm-body">
        <aside className="gm-sidebar">
          <div className="gm-card">
            <div className="gm-card-title"><Crosshair size={15} /> Visual Location Editor</div>
            <p className="gm-muted">Search for a place, click the map, or drag the gold draft pin. You should not need to type coordinates manually.</p>
            <div className="gm-search-row">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void searchLocation();
                }}
                placeholder="Search address, business, city..."
              />
              <button type="button" className="gm-btn" disabled={searching || !searchQuery.trim()} onClick={searchLocation}>
                <Search size={14} /> {searching ? 'Searching' : 'Search'}
              </button>
            </div>
            <div className="gm-action-row">
              <button type="button" className="gm-btn" onClick={focusDraftOnMap}>
                <LocateFixed size={14} /> Focus Pin
              </button>
              <button type="button" className="gm-btn" disabled={!mapCenter} onClick={useMapCenter}>
                Use Map Center
              </button>
            </div>
            <div className="gm-coord-pill">
              {coordsFromDraft(draft)
                ? `Selected: ${Number(draft.lat).toFixed(5)}, ${Number(draft.lng).toFixed(5)}`
                : 'No location selected yet'}
            </div>
            <label>Name<input value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} placeholder="Business, site, or GeoNFT name" /></label>
            <div className="gm-grid">
              <label>ID<input value={draft.id} onChange={(e) => updateDraft('id', e.target.value)} placeholder="slug-id" /></label>
              <label>Type<select value={draft.type} onChange={(e) => updateDraft('type', e.target.value)}>
                {PLACE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select></label>
            </div>
            <label>Website / URL<input value={draft.link} onChange={(e) => updateDraft('link', e.target.value)} placeholder="https://..." /></label>
            <details className="gm-advanced">
              <summary>Advanced metadata</summary>
              <label>STAR Holon ID<input value={draft.starHolonId} onChange={(e) => updateDraft('starHolonId', e.target.value)} placeholder="optional existing holon id" /></label>
              <div className="gm-grid">
                <label>Longitude<input value={draft.lng} onChange={(e) => updateDraft('lng', e.target.value)} placeholder="-87.064" /></label>
                <label>Latitude<input value={draft.lat} onChange={(e) => updateDraft('lat', e.target.value)} placeholder="20.633" /></label>
              </div>
              <label>Description<textarea value={draft.desc} onChange={(e) => updateDraft('desc', e.target.value)} rows={3} /></label>
            </details>
            <button type="button" className="gm-primary" disabled={!canUseDraft} onClick={saveDraft}>
              <Save size={14} /> Save / Update Visual Pin
            </button>
          </div>

          <div className="gm-card">
            <div className="gm-card-title"><MessageSquareText size={15} /> Agent-Guided Actions</div>
            <p className="gm-muted">These buttons do not run the operation directly. They prepare Composer on the right with the selected location and attached data file so the agent can guide the next step.</p>
            <button type="button" className="gm-btn gm-btn-wide" disabled={!canUseDraft} onClick={() => draftHolonPrompt('holon')}>
              Draft Composer: Create / Link Holon
            </button>
            <button type="button" className="gm-btn gm-btn-wide" disabled={!canUseDraft} onClick={() => draftHolonPrompt('geonft')}>
              Draft Composer: Drop GeoNFT Here
            </button>
            {paths ? (
              <button type="button" className="gm-btn gm-btn-wide" onClick={() => openFile(paths.dataPath)}>
                <FileCode2 size={14} /> Open Data File
              </button>
            ) : null}
          </div>

          <div className="gm-card">
            <div className="gm-card-title"><Sparkles size={15} /> Added Holonic Places</div>
            {places.length ? (
              <div className="gm-place-list">
                {places.map((place) => (
                  <button key={place.id} type="button" className="gm-place-row" onClick={() => setDraft(placeToDraft(place))}>
                    <strong>{place.name}</strong>
                    <span>{place.type}{place.starHolonId ? ` · holon ${place.starHolonId.slice(0, 8)}...` : ''}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="gm-muted">No places yet. The map starts generic; saved holons, businesses, GeoNFTs, and projects will appear here.</p>
            )}
          </div>

          {status ? <div className="gm-status">{status}</div> : null}
          {error ? <div className="gm-error">{error}</div> : null}
        </aside>

        <main className="gm-preview">
          {iframeSrc ? (
            <iframe ref={iframeRef} key={iframeSrc} title="OASIS IDE Guide Map preview" src={iframeSrc} />
          ) : (
            <div className="gm-empty">Open the OASIS_CLEAN workspace to preview the cloned guide map.</div>
          )}
        </main>
      </div>
    </section>
  );
};
