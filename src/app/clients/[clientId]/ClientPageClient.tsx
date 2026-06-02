"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CopyLink from "@/components/CopyLink";
import { useToast } from "@/components/Toast";
import ViewToggle, { useViewMode } from "@/components/ViewToggle";
import {
  DEFAULT_CONTACT_CAPS,
  SET_STATUS_LABELS,
  SET_STATUS_PILL,
  type ContactCaps,
  type SetStatus,
} from "@/lib/types";
import ContactCapsPicker from "@/components/ContactCapsPicker";
import {
  addSet,
  deleteClient,
  deleteSet,
  regenerateClientSlug,
  updateClient,
  updateSet,
} from "../../actions";
import {
  addContact,
  removeContact,
  setContactCaps,
} from "../../settings/team/actions";

type DetailSet = {
  id: string;
  name: string;
  slug: string | null;
  status: SetStatus;
  due_date: string | null;
};
type DetailContact = {
  id: string;
  email: string;
  name: string | null;
  can_comment: boolean;
  can_approve: boolean;
  can_edit: boolean;
};
export type ClientDetail = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  contact_email: string | null;
  brand_name: string | null;
  brand_logo: string | null;
  creative_sets: DetailSet[];
  client_contacts: DetailContact[];
};

export default function ClientPageClient({ client }: { client: ClientDetail }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
      <DetailsCard client={client} onChanged={refresh} />
      <SetsSection client={client} onChanged={refresh} />
      <ContactsSection client={client} onChanged={refresh} />
    </main>
  );
}

function DetailsCard({
  client,
  onChanged,
}: {
  client: ClientDetail;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast, confirm } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.contact_email ?? "");
  const [brandName, setBrandName] = useState(client.brand_name ?? "");
  const [brandLogo, setBrandLogo] = useState(client.brand_logo ?? "");
  const [logo, setLogo] = useState(client.logo_url ?? "");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName(client.name);
    setEmail(client.contact_email ?? "");
    setBrandName(client.brand_name ?? "");
    setBrandLogo(client.brand_logo ?? "");
    setLogo(client.logo_url ?? "");
  }

  async function save() {
    setBusy(true);
    const res = await updateClient(client.id, {
      name,
      contact_email: email,
      brand_name: brandName,
      brand_logo: brandLogo,
      logo_url: logo,
    });
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    setEditing(false);
    toast("Client updated.", "success");
    onChanged();
  }

  async function remove() {
    if (
      !(await confirm(
        `Delete “${client.name}” and all of its sets and creatives? This cannot be undone.`,
      ))
    )
      return;
    setBusy(true);
    const res = await deleteClient(client.id);
    if (res.error) {
      setBusy(false);
      return toast(res.error, "error");
    }
    toast("Client deleted.", "success");
    router.push("/");
  }

  async function regenSlug() {
    if (
      !(await confirm(
        "Regenerate this client's review URL from its current name? Any /c/… link you've already shared with them will stop working.",
      ))
    )
      return;
    setBusy(true);
    const res = await regenerateClientSlug(client.id);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    toast(`URL updated to /c/${res.slug}`, "success");
    onChanged();
  }

  async function copyLink() {
    if (!client.slug) {
      return toast("No link yet — regenerate from name first.", "error");
    }
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/c/${client.slug}`,
      );
      toast("Dashboard link copied.", "success");
    } catch {
      toast("Couldn't copy to clipboard.", "error");
    }
  }

  const heroLogo = client.brand_logo || client.logo_url;

  if (!editing) {
    return (
      <section className="rounded-xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-6">
        <div className="flex items-start gap-4">
          {heroLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroLogo} alt="" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-neutral-800 text-2xl text-neutral-400">
              {client.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold">{client.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-neutral-400">
              {client.brand_name && <span>Brand: {client.brand_name}</span>}
              {client.contact_email && <span>{client.contact_email}</span>}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              {client.creative_sets.length} set
              {client.creative_sets.length === 1 ? "" : "s"} ·{" "}
              {client.client_contacts.length} contact
              {client.client_contacts.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            onClick={() => {
              reset();
              setEditing(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="mb-3 text-sm font-semibold">Edit client</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Contact email" value={email} onChange={setEmail} />
        <Field label="Brand name (mockups)" value={brandName} onChange={setBrandName} />
        <Field label="Brand logo URL (mockups)" value={brandLogo} onChange={setBrandLogo} />
        <Field label="Client logo URL (portal header)" value={logo} onChange={setLogo} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs">
        <span className="text-neutral-500">Review dashboard link</span>
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
          /c/{client.slug ?? "—"}
        </code>
        <button
          onClick={copyLink}
          disabled={busy || !client.slug}
          className="rounded-lg border border-neutral-700 px-2.5 py-1 text-indigo-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          Copy link
        </button>
        <button
          onClick={regenSlug}
          disabled={busy}
          className="rounded-lg border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800 disabled:opacity-50"
        >
          Regenerate from name
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={remove}
          disabled={busy}
          className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400 hover:bg-red-500/15 disabled:opacity-50"
        >
          Delete client
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => {
              reset();
              setEditing(false);
            }}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SetsSection({
  client,
  onChanged,
}: {
  client: ClientDetail;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useViewMode("sets-view", "list");

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await addSet(client.id, name);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    setName("");
    toast("Set added.", "success");
    onChanged();
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-semibold">
          Sets{" "}
          <span className="font-normal text-neutral-400">
            ({client.creative_sets.length})
          </span>
        </h2>
        {client.creative_sets.length > 0 && (
          <ViewToggle value={view} onChange={setView} />
        )}
      </div>
      <div className="p-4">
        {client.creative_sets.length === 0 ? (
          <p className="mb-2 text-sm text-neutral-400">No sets yet.</p>
        ) : view === "card" ? (
          <div className="mb-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {client.creative_sets.map((s) => (
              <SetRow key={s.id} set={s} clientSlug={client.slug} onChanged={onChanged} card />
            ))}
          </div>
        ) : (
          client.creative_sets.map((s) => (
            <SetRow key={s.id} set={s} clientSlug={client.slug} onChanged={onChanged} />
          ))
        )}
        <div className="mt-2 flex gap-2 border-t border-neutral-800 pt-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New set name"
            className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          />
          <button
            onClick={add}
            disabled={busy}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-indigo-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? "Adding…" : "+ Set"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SetRow({
  set,
  clientSlug,
  onChanged,
  card = false,
}: {
  set: DetailSet;
  clientSlug: string | null;
  onChanged: () => void;
  card?: boolean;
}) {
  const { toast, confirm } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(set.name);
  const [due, setDue] = useState(set.due_date ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await updateSet(set.id, { name, due_date: due || null });
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    setEditing(false);
    toast("Set updated.", "success");
    onChanged();
  }
  async function remove() {
    if (
      !(await confirm(
        `Delete the set “${set.name}” and its creatives? This cannot be undone.`,
      ))
    )
      return;
    setBusy(true);
    const res = await deleteSet(set.id);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    toast("Set deleted.", "success");
    onChanged();
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-800 py-2.5 first:border-t-0">
        <label className="min-w-40 flex-1 text-xs text-neutral-500">
          Set name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Due date
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="mt-1 block rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  const meta = (
    <div className="min-w-0 text-sm">
      <span className="font-medium">{set.name}</span>{" "}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] ${SET_STATUS_PILL[set.status]}`}
      >
        {SET_STATUS_LABELS[set.status]}
      </span>
      {set.due_date && (
        <span className="text-neutral-400"> · due {set.due_date}</span>
      )}
    </div>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/editor/${set.id}`}
        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-neutral-800"
      >
        Open editor
      </Link>
      <CopyLink clientSlug={clientSlug} setSlug={set.slug} />
      <button
        onClick={() => setEditing(true)}
        className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs hover:bg-neutral-800"
      >
        Rename
      </button>
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/15 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );

  if (card) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
        <div className="mb-2">{meta}</div>
        {actions}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t border-neutral-800 py-2.5 first:border-t-0">
      {meta}
      {actions}
    </div>
  );
}

function ContactsSection({
  client,
  onChanged,
}: {
  client: ClientDetail;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [caps, setCaps] = useState<ContactCaps>(DEFAULT_CONTACT_CAPS);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    const res = await addContact(client.id, email, caps);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    setEmail("");
    setCaps(DEFAULT_CONTACT_CAPS);
    toast("Contact added.", "success");
    onChanged();
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-semibold">
          Client contacts{" "}
          <span className="font-normal text-neutral-400">
            ({client.client_contacts.length})
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Who can open this client&apos;s review portal, and what they can do.
        </p>
      </div>
      <div className="p-4">
        {client.client_contacts.length === 0 ? (
          <p className="mb-2 text-sm text-neutral-400">No contacts yet.</p>
        ) : (
          client.client_contacts.map((ct) => (
            <ContactRow key={ct.id} contact={ct} onChanged={onChanged} />
          ))
        )}
        <div className="mt-2 space-y-2 border-t border-neutral-800 pt-3">
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="client@email.com"
              className="min-w-48 flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
            />
            <button
              onClick={add}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
          <ContactCapsPicker value={caps} onChange={setCaps} />
        </div>
      </div>
    </section>
  );
}

function ContactRow({
  contact,
  onChanged,
}: {
  contact: DetailContact;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const caps: ContactCaps = {
    can_comment: contact.can_comment,
    can_approve: contact.can_approve,
    can_edit: contact.can_edit,
  };

  async function changeCaps(next: ContactCaps) {
    setBusy(true);
    const res = await setContactCaps(contact.id, next);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    onChanged();
  }
  async function remove() {
    setBusy(true);
    const res = await removeContact(contact.id);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    toast("Contact removed.", "success");
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 py-2.5 text-sm first:border-t-0">
      <span className="min-w-32 flex-1 truncate">
        {contact.email}
        {contact.name && <span className="text-neutral-500"> · {contact.name}</span>}
      </span>
      <ContactCapsPicker value={caps} onChange={changeCaps} disabled={busy} />
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/15 disabled:opacity-50"
      >
        Remove
      </button>
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
