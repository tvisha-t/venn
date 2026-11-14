"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { ErrorState, LoadingRows } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventDetail as Detail } from "@/server/events";
import { EventDetail } from "@/components/events/EventDetail";

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<{ msg: string; notFound: boolean } | null>(null);
  const load = useCallback(() => {
    setErr(null);
    api<Detail>(`/api/events/${id}`).then(setData).catch((e) => setErr({ msg: (e as Error).message, notFound: e instanceof ApiError && e.status === 404 }));
  }, [id]);
  useEffect(load, [load]);

  if (err?.notFound) return (
    <div className="mx-auto max-w-[720px] rounded-lg border border-line bg-surface p-6 text-center shadow-card">
      <p className="text-title-3">This event isn&apos;t available</p>
      <Link href="/events" className="mt-2 inline-block text-body-sm font-semibold text-link underline underline-offset-2">Back to events</Link>
    </div>
  );
  if (err) return <div className="mx-auto max-w-[720px]"><ErrorState message={err.msg} onRetry={load} /></div>;
  if (!data) return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <LoadingRows n={3} label="Loading event" />
    </div>
  );
  return <EventDetail initial={data} />;
}
