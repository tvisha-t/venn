"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { ErrorState } from "@/components/states";

export type Cluster = { id: string; lat: number; lng: number; count: number; label?: string };

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const ATLANTA: [number, number] = [-84.3963, 33.7756];

/**
 * Renders count bubbles only — never individual people. Data comes from a loader
 * (server clusters with k-anonymity applied, or city-level groups).
 */
/** Plum cluster; the selected one gets a petal ring (accent only). */
function styleSelected(el: HTMLElement, on: boolean) {
  el.style.boxShadow = on ? "0 0 0 3px #C0699B, 0 1px 3px rgba(23,19,26,.25)" : "0 1px 3px rgba(23,19,26,.25)";
  el.setAttribute("aria-pressed", String(on));
}

export type MapFocus = { lat: number; lng: number; zoom: number; key: string };

export function ClusterMap({
  load, onSelect, reloadKey, initialZoom = 3.6, center = ATLANTA, selectedId, focus, me,
}: {
  selectedId?: string | null;
  /** Fly the map here whenever `key` changes (e.g. "Use my location"). */
  focus?: MapFocus | null;
  /** Approximate viewer position (already rounded to ~1 km). Shown only to the viewer, never sent anywhere else. */
  me?: { lat: number; lng: number } | null;
  load: (bbox: [number, number, number, number], zoom: number) => Promise<{ clusters: Cluster[]; hidden?: number }>;
  onSelect: (c: Cluster, zoom: number) => void;
  reloadKey?: string;
  initialZoom?: number;
  center?: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const meMarker = useRef<Marker | null>(null);
  const pendingFocus = useRef<MapFocus | null>(focus ?? null);
  const els = useRef(new Map<string, HTMLButtonElement>());
  const loadRef = useRef(load);
  loadRef.current = load;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const selectedRef = useRef(selectedId ?? null);
  const [hidden, setHidden] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState<{ clusters: Cluster[] } | null>(null);

  /** No WebGL / tiles unreachable: show the same aggregate groups as a list, labelled by nearest city. */
  async function showFallback() {
    try {
      const [{ clusters }, { cities }] = await Promise.all([
        loadRef.current([-180, -85, 180, 85], 3),
        fetch("/api/cities").then((r) => r.json()) as Promise<{ cities: { city: string; state: string; lat: number; lng: number }[] }>,
      ]);
      const near = (c: Cluster) => cities.reduce((b, x) => (Math.hypot(x.lat - c.lat, x.lng - c.lng) < Math.hypot(b.lat - c.lat, b.lng - c.lng) ? x : b), cities[0]);
      setFallback({ clusters: clusters.map((c) => ({ ...c, label: c.label ?? `Near ${near(c).city}` })).sort((a, b) => b.count - a.count) });
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  }

  async function refresh() {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    const zoom = m.getZoom();
    setLoading(true);
    try {
      const { clusters, hidden: h } = await loadRef.current([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom);
      const { Marker } = await import("maplibre-gl");
      markers.current.forEach((mk) => mk.remove());
      els.current.clear();
      markers.current = clusters.map((c) => {
        const el = document.createElement("button");
        const size = Math.round(Math.min(56, 28 + Math.sqrt(c.count) * 4));
        el.className = "venn-cluster";
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:#7A3E6A;color:#fff;border:2px solid #fff;font:600 12px var(--font-jakarta),system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 3px rgba(15,27,45,.25);transition:box-shadow .15s`;
        styleSelected(el, c.id === selectedRef.current);
        el.textContent = String(c.count);
        el.setAttribute("aria-label", `${c.count} ${c.count === 1 ? "person" : "people"}${c.label ? ` in ${c.label}` : ""}. Show list.`);
        el.addEventListener("click", (e) => { e.stopPropagation(); selectRef.current(c, m.getZoom()); });
        els.current.set(c.id, el);
        return new Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(m);
      });
      setHidden(h ?? 0);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      // The bundler can't resolve MapLibre's worker; serve it from /public (copied on npm install).
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
      if (!gl) { showFallback(); return; }
      let m: MlMap;
      try {
        m = new maplibregl.Map({ container: ref.current, style: STYLE, center, zoom: initialZoom, attributionControl: { compact: true } });
      } catch { showFallback(); return; }
      const timer = setTimeout(() => { if (!m.loaded()) { m.remove(); map.current = null; showFallback(); } }, 8000);
      m.on("load", () => clearTimeout(timer));
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        if (pendingFocus.current) { const f = pendingFocus.current; m.jumpTo({ center: [f.lng, f.lat], zoom: f.zoom }); }
        refresh();
      });
      m.on("moveend", refresh);
      m.on("error", () => {});
      map.current = m;
    })();
    return () => { cancelled = true; markers.current.forEach((mk) => mk.remove()); meMarker.current?.remove(); map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    selectedRef.current = selectedId ?? null;
    els.current.forEach((el, id) => styleSelected(el, id === selectedId));
  }, [selectedId]);

  // Fly to a new focus point (respects reduced motion).
  useEffect(() => {
    if (!focus) return;
    pendingFocus.current = focus;
    const m = map.current;
    if (!m || !m.loaded()) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) m.jumpTo({ center: [focus.lng, focus.lat], zoom: focus.zoom });
    else m.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, speed: 1.4 });
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // "You are here" dot (client-side only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      meMarker.current?.remove();
      meMarker.current = null;
      if (!me) return;
      const { Marker } = await import("maplibre-gl");
      const add = () => {
        if (cancelled || !map.current) return;
        const el = document.createElement("div");
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", "Your approximate location");
        el.style.cssText = "width:16px;height:16px;border-radius:9999px;background:#C0699B;border:3px solid #fff;box-shadow:0 0 0 6px rgba(192,105,155,.25)";
        meMarker.current = new Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(map.current);
      };
      if (map.current?.loaded()) add(); else map.current?.once("load", add);
    })();
    return () => { cancelled = true; };
  }, [me?.lat, me?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (map.current?.loaded()) refresh(); else if (fallback) showFallback(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fallback) {
    return (
      <div className="space-y-2">
        <p className="text-meta text-ink-2">The interactive map isn&apos;t available on this device, so here are the same groups as a list.</p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="People by area">
          {fallback.clusters.map((c) => (
            <li key={c.id}>
              <button onClick={() => selectRef.current(c, 3)} aria-pressed={c.id === selectedId}
                className={`flex w-full items-center justify-between rounded-lg border bg-surface px-3 py-2.5 text-left text-[14px] transition-shadow hover:shadow-[0_1px_3px_rgba(15,27,45,0.08)] ${c.id === selectedId ? "border-brand/30 ring-2 ring-petal" : ""}`}>
                <span>{c.label}</span><span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-semibold text-white">{c.count}</span>
              </button>
            </li>
          ))}
        </ul>
        {fallback.clusters.length === 0 && <p className="text-sm text-gray-matter">No one with a location matches these filters.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {err && <ErrorState message={err} onRetry={refresh} />}
      <div className="relative">
        <div ref={ref} className="h-[480px] w-full overflow-hidden rounded-lg border bg-muted" role="application" aria-label="Map of GT people, shown as group counts" />
        {loading && <div className="absolute left-3 top-3 rounded-md bg-surface/95 px-2 py-1 text-meta shadow-sm" role="status">Loading map…</div>}
      </div>
      <p className="text-meta text-ink-2">
        Locations are rounded to about 1 km. Zoomed in past city level, groups smaller than 3 people are hidden so no one can be pinpointed.
        {hidden > 0 && ` ${hidden} ${hidden === 1 ? "person is" : "people are"} hidden at this zoom.`}
      </p>
    </div>
  );
}
