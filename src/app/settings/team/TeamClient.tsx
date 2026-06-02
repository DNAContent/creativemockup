"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import ContactCapsPicker from "@/components/ContactCapsPicker";
import { DEFAULT_CONTACT_CAPS, type ContactCaps } from "@/lib/types";
import { denyRequest, grantRequest } from "./actions";

export type PendingRequest = {
  id: string;
  email: string;
  message: string | null;
  created_at: string;
  creative_sets:
    | { name: string; clients: { name: string } | { name: string }[] }
    | { name: string; clients: { name: string } | { name: string }[] }[];
};

export default function TeamClient({
  requests,
}: {
  requests: PendingRequest[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-6">
      <h2 className="mb-2 text-sm font-semibold">
        Access requests{" "}
        {requests.length > 0 && (
          <span className="font-normal text-neutral-400">({requests.length})</span>
        )}
      </h2>
      {requests.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No pending requests. Manage each client&apos;s contacts from their page.
        </p>
      ) : (
        requests.map((r) => (
          <RequestRow key={r.id} request={r} onChanged={refresh} />
        ))
      )}
    </main>
  );
}

function setName(req: PendingRequest) {
  const cs = Array.isArray(req.creative_sets)
    ? req.creative_sets[0]
    : req.creative_sets;
  const clientRel = cs?.clients;
  const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
  return `${client?.name ?? "?"} — ${cs?.name ?? "?"}`;
}

function RequestRow({
  request,
  onChanged,
}: {
  request: PendingRequest;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [caps, setCaps] = useState<ContactCaps>(DEFAULT_CONTACT_CAPS);
  const [busy, setBusy] = useState(false);

  async function grant() {
    setBusy(true);
    const res = await grantRequest(request.id, caps);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    toast("Access granted.", "success");
    onChanged();
  }
  async function deny() {
    setBusy(true);
    const res = await denyRequest(request.id);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    onChanged();
  }

  return (
    <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="text-sm">
        <strong>{request.email}</strong>
        <span className="text-neutral-400"> wants access to </span>
        {setName(request)}
      </div>
      {request.message && (
        <p className="mt-1 text-sm text-neutral-400">“{request.message}”</p>
      )}
      <div className="mt-2 space-y-2">
        <ContactCapsPicker value={caps} onChange={setCaps} disabled={busy} />
        <div className="flex gap-2">
          <button
            onClick={grant}
            disabled={busy}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Grant
          </button>
          <button
            onClick={deny}
            disabled={busy}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
