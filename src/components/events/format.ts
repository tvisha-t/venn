// Event dates are shown in the event's own time zone (all current events are in Atlanta).
export const EVENT_TZ = "America/New_York";

const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TZ, ...o }).format(new Date(iso));

export const monthShort = (iso: string) => part(iso, { month: "short" }).toUpperCase();
export const dayNum = (iso: string) => part(iso, { day: "2-digit" });
export const weekday = (iso: string) => part(iso, { weekday: "short" });
export const timeOf = (iso: string) => part(iso, { hour: "numeric", minute: "2-digit" });
export const fullDate = (iso: string) => part(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const whenShort = (iso: string) => `${weekday(iso)} · ${timeOf(iso)}`;
export const whenRange = (start: string, end: string | null) =>
  end ? `${weekday(start)} · ${timeOf(start)}–${timeOf(end)}` : whenShort(start);

export const CATEGORY_CHIPS = [
  { key: "all", label: "All" },
  { key: "game_watch", label: "Game watches" },
  { key: "career", label: "Career" },
  { key: "social", label: "Social" },
  { key: "volunteer", label: "Volunteer" },
  { key: "family", label: "Family" },
  { key: "member_hosted", label: "Hosted by Jackets" },
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  game_watch: "Game watch", career: "Career", social: "Social", volunteer: "Volunteer", family: "Family", member_hosted: "Hosted by a Jacket",
};

export const directionsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
