"use client";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ProfileDetail } from "@/components/ProfileDetail";
import type { PublicProfile } from "@/lib/api";

export { Pills } from "@/components/ProfileDetail";

/** Slide-over version of the profile pane (used from Requests, Map and Companies). */
export function ProfileSheet({ id, onClose, onRequest }: { id: string | null; onClose: () => void; onRequest: (p: PublicProfile) => void }) {
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto bg-surface p-0 sm:max-w-[480px]">
        <SheetTitle className="sr-only">Profile</SheetTitle>
        <SheetDescription className="sr-only">Public profile details. No contact information.</SheetDescription>
        {id && <ProfileDetail id={id} onRequest={onRequest} />}
      </SheetContent>
    </Sheet>
  );
}
