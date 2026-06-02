"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import ViewToggle, { useViewMode } from "@/components/ViewToggle";
import Logo from "@/components/Logo";
import { PlusIcon } from "@/components/icons";
import type { SetStatus } from "@/lib/types";
import { addClient } from "./actions";

export type HomeClient = {
  id: string;
  name: string;
  logo_url: string | null;
  brand_logo: string | null;
  contact_email: string | null;
  creative_sets: { id: string; status: SetStatus }[];
};

function clientLogo(c: HomeClient) {
  return c.brand_logo || c.logo_url;
}

export default function DashboardClient({ clients }: { clients: HomeClient[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useViewMode("clients-view", "list");

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Clients{" "}
          <span className="font-normal text-neutral-400">({clients.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {clients.length > 0 && <ViewToggle value={view} onChange={setView} />}
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add client
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
          No clients yet.
          <button
            onClick={() => setOpen(true)}
            className="ml-1 text-indigo-300 hover:underline"
          >
            Add your first one.
          </button>
        </div>
      ) : view === "card" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {clients.map((c) => {
            const logo = clientLogo(c);
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-center hover:-translate-y-0.5 hover:border-neutral-700 hover:bg-neutral-800/50 hover:shadow-lg hover:shadow-black/20"
              >
                <Logo
                  src={logo}
                  name={c.name}
                  imgClassName="h-14 w-14 rounded-xl object-cover"
                  fallbackClassName="grid h-14 w-14 place-items-center rounded-xl bg-neutral-800 text-xl text-neutral-400"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-neutral-500">
                    {c.creative_sets.length} set
                    {c.creative_sets.length === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {clients.map((c) => {
            const approved = c.creative_sets.filter(
              (s) => s.status === "approved",
            ).length;
            const logo = clientLogo(c);
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex items-center gap-3 border-t border-neutral-800 px-4 py-3 first:border-t-0 hover:bg-neutral-800/50"
              >
                <Logo
                  src={logo}
                  name={c.name}
                  imgClassName="h-8 w-8 rounded object-cover"
                  fallbackClassName="grid h-8 w-8 place-items-center rounded bg-neutral-800 text-xs text-neutral-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  {c.contact_email && (
                    <div className="truncate text-xs text-neutral-500">
                      {c.contact_email}
                    </div>
                  )}
                </div>
                <span className="text-xs text-neutral-400">
                  {c.creative_sets.length} set
                  {c.creative_sets.length === 1 ? "" : "s"}
                  {approved > 0 && (
                    <span className="text-green-400"> · {approved} approved</span>
                  )}
                </span>
                <span className="text-neutral-600">→</span>
              </Link>
            );
          })}
        </div>
      )}

      {open && (
        <AddClientModal
          onClose={() => setOpen(false)}
          onAdded={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function AddClientModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState(false);

  // Close on Escape.
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function submit() {
    if (!name.trim()) return toast("Client name is required.", "error");
    setBusy(true);
    const res = await addClient(name, email, logo, brandName, brandLogo);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    toast("Client added.", "success");
    onAdded();
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-client-title"
        className="animate-scale-in max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-client-title" className="mb-1 text-sm font-semibold">
          Add a client
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          Brand name &amp; logo prefill every new creative&apos;s mockup.
        </p>
        <div className="space-y-2">
          <Field label="Client name *" value={name} onChange={setName} />
          <Field label="Contact email" value={email} onChange={setEmail} />
          <Field label="Brand name (mockups)" value={brandName} onChange={setBrandName} />
          <Field label="Brand logo URL (mockups)" value={brandLogo} onChange={setBrandLogo} />
          <Field label="Client logo URL (portal header)" value={logo} onChange={setLogo} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add client"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-neutral-500">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
      />
    </label>
  );
}
