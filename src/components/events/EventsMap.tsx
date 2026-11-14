"use client";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker } from "maplibre-gl";
import type { EventItem } from "@/server/events";

const STYLE = "https://tiles.openfreemap.org/styles/positron";

/** Navy numbered pin; the featured or hovered event's pin turns gold, larger, with a navy ring. */
function stylePin(el: HTMLElement, on: boolean) {
  const size = on ? 30 : 26;
  el.style.width = el.style.height = `${size}px`;
  el.style.background = on ? "var(--accent)" : "var(--primary-brand)";
  el.style.color = on ? "var(--on-accent)" : "#ffffff";
  el.style.boxShadow = on ? "0 0 0 3px var(--primary-brand)" : "0 0 0 2px #ffffff";
  el.style.zIndex = on ? "2" : "1";
}

/**
 * Venue pins only, numbered to match the list (decorative: the list carries all the information).
 * Never plots people.
 */
export function EventsMap({ events, featuredId, activeId, onHover }: { events: EventItem[]; featuredId: string | null; activeId: string | null; onHover: (id: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<{ id: string; el: HTMLElement; mk: Marker }[]>([]);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
      if (!gl) return; // the list carries everything; no map is fine
      const m = new maplibregl.Map({ container: ref.current, style: STYLE, center: [-84.385, 33.78], zoom: 10.5, attributionControl: { compact: true }, interactive: true, cooperativeGestures: true });
      map.current = m;
      m.on("load", () => {
        // Keep the (required) map credits collapsed to the small "i" button so they don't cover the pins.
        ref.current?.querySelectorAll(".maplibregl-ctrl-attrib.maplibregl-compact-show").forEach((el) => {
          el.classList.remove("maplibregl-compact-show");
          el.removeAttribute("open");
        });
        // Light, greyscale-ish base.
        for (const l of m.getStyle().layers ?? []) {
          if (l.type === "fill" && /park|landuse|wood|grass/i.test(l.id)) { try { m.setPaintProperty(l.id, "fill-opacity", 0.35); } catch { /* style varies */ } }
        }
      });
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // (Re)place pins whenever the list changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await waitFor(() => map.current);
      if (cancelled || !m) return;
      const { Marker, LngLatBounds } = await import("maplibre-gl");
      markers.current.forEach((x) => x.mk.remove());
      const pins = [
        ...(featuredId ? events.filter((e) => e.id === featuredId).map((e) => ({ e, label: "" })) : []),
        ...events.filter((e) => e.id !== featuredId).map((e, i) => ({ e, label: String(i + 1) })),
      ];
      // Venues at the same spot (e.g. two events at a neighborhood center): fan them out so none hides.
      const seen = new Map<string, number>();
      markers.current = pins.map(({ e, label }) => {
        const k = `${e.lat.toFixed(4)},${e.lng.toFixed(4)}`;
        const nth = seen.get(k) ?? 0;
        seen.set(k, nth + 1);
        const el = document.createElement("div");
        el.className = "grid place-items-center rounded-full font-mono text-[12px] font-medium transition-all";
        el.textContent = label || "•";
        el.addEventListener("mouseenter", () => hoverRef.current(e.id));
        el.addEventListener("mouseleave", () => hoverRef.current(null));
        stylePin(el, e.id === featuredId);
        const offset: [number, number] = nth === 0 ? [0, 0] : [Math.cos(nth * 2.1) * 22, Math.sin(nth * 2.1) * 22];
        return { id: e.id, el, mk: new Marker({ element: el, offset }).setLngLat([e.lng, e.lat]).addTo(m) };
      });
      if (pins.length) {
        const b = new LngLatBounds();
        pins.forEach(({ e }) => b.extend([e.lng, e.lat]));
        m.fitBounds(b, { padding: 36, maxZoom: 12.5, duration: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [events, featuredId]);

  useEffect(() => {
    for (const x of markers.current) stylePin(x.el, x.id === activeId || (activeId == null && x.id === featuredId));
  }, [activeId, featuredId]);

  return (
    <div aria-hidden className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
      <div ref={ref} className="h-60 overflow-hidden rounded-[16px] bg-surface-raised [&_canvas]:[filter:grayscale(0.85)_contrast(0.95)]" />
      <p className="mt-2.5 text-[12px] leading-4 text-text-subtle">Numbers match the list. Venues only, never people&apos;s locations.</p>
    </div>
  );
}

async function waitFor<T>(get: () => T | null, ms = 10000): Promise<T | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = get();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
