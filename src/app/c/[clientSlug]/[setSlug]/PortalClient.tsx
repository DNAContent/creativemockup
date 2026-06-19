"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import dynamic from "next/dynamic";
import ZoomBar from "@/components/ZoomBar";
import ActionButton from "@/components/ActionButton";
import Logo from "@/components/Logo";
import {
  creativeStatusDot,
  creativeStatusLabel,
  SET_STATUS_LABELS,
  SET_STATUS_PILL,
  type Creative,
  type ReviewComment,
  type SetStatus,
} from "@/lib/types";

// Heavy (pulls in renderMockup + the iframe machinery) — code-split it out of
// the portal's first-load JS so the shell hydrates faster.
const MockupCanvas = dynamic(() => import("@/components/MockupCanvas"));

export type PortalCreative = Creative & { comments: ReviewComment[] };

const TARGETS = ["General", "Copy", "Visual", "Headline", "CTA"] as const;
const supabase = createClient();

export default function PortalClient({
  setId,
  setName,
  setStatus,
  notes,
  client,
  caps: capsProp,
  userEmail,
  initialCreatives,
}: {
  setId: string;
  setName: string;
  setStatus: SetStatus;
  notes: string | null;
  client: { name: string; logo_url: string | null };
  caps: { comment: boolean; approve: boolean; edit: boolean };
  userEmail: string;
  initialCreatives: PortalCreative[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  // Granular capabilities from the contact's flags (resolve rides with comment).
  const caps = {
    comment: capsProp.comment,
    approve: capsProp.approve,
    resolve: capsProp.comment,
    edit: capsProp.edit,
  };
  const [showResolved, setShowResolved] = useState(false);
  const [acting, setActing] = useState(false);
  const [zoom, setZoom] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialCreatives[0]?.id ?? null,
  );
  const [tab, setTab] = useState<"review" | "edit">("review");
  const selected =
    initialCreatives.find((c) => c.id === selectedId) ?? null;

  // Draft for editor-tier inline edits; also what the preview renders. Follows
  // the server row on refresh (so viewers see live updates) EXCEPT while an
  // editor-tier client has unsaved edits, so realtime can't clobber them.
  const [draft, setDraft] = useState<PortalCreative | null>(selected);
  const seenRef = useRef<PortalCreative | null>(selected);
  const portalDirty =
    caps.edit &&
    !!draft &&
    !!selected &&
    draft.id === selected.id &&
    (draft.headline !== selected.headline ||
      draft.copy !== selected.copy ||
      draft.cta !== selected.cta);
  if (selected !== seenRef.current) {
    seenRef.current = selected;
    if (!portalDirty) setDraft(selected);
  }

  // Realtime: refresh when this set's creatives / comments / replies change.
  // Use the set id from props (not the first creative) so a client sitting on a
  // just-shared EMPTY set still gets the `ads` subscription and sees the first
  // creative appear live, instead of being stuck on "Nothing to review yet".
  const realtimeSetId = setId;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => startTransition(() => router.refresh()), 300);
    };
    // Build the channel + listeners synchronously so cleanup can always remove
    // it; only auth + subscribe are async.
    const ch = supabase.channel(`portal-${realtimeSetId ?? "none"}`);
    if (realtimeSetId) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: "ads", filter: `set_id=eq.${realtimeSetId}` }, bump);
    }
    ch.on("postgres_changes", { event: "*", schema: "public", table: "creative_sets", filter: `id=eq.${setId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "replies" }, bump);
    // Defer the WebSocket handshake past first paint — live updates aren't
    // needed in the first second and the connect competes with hydration.
    const startTimer = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (data.session) supabase.realtime.setAuth(data.session.access_token);
        ch.subscribe();
      });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeSetId]);

  async function approve(adId: string, status: "approved" | "needs-edits") {
    setActing(true);
    const { error } = await supabase.rpc("set_creative_approval", {
      p_ad_id: adId,
      p_status: status,
    });
    setActing(false);
    if (error) return toast(error.message, "error");
    toast(status === "approved" ? "Approved." : "Edits requested.", "success");
    refresh();
  }
  async function comment(adId: string, text: string, target: string) {
    const body = text.trim();
    if (!body) return;
    const { error } = await supabase
      .from("comments")
      .insert({ ad_id: adId, author: userEmail, text: body, target });
    if (error) return toast(error.message, "error");
    toast("Comment posted.", "success");
    refresh();
  }
  async function reply(commentId: string, text: string) {
    const body = text.trim();
    if (!body) return;
    const { error } = await supabase
      .from("replies")
      .insert({ comment_id: commentId, author: userEmail, text: body });
    if (error) return toast(error.message, "error");
    toast("Reply posted.", "success");
    refresh();
  }
  async function resolve(commentId: string, resolved: boolean) {
    const { error } = await supabase
      .from("comments")
      .update({ resolved })
      .eq("id", commentId);
    if (error) return toast(error.message, "error");
    toast(resolved ? "Resolved." : "Reopened.", "success");
    refresh();
  }
  async function saveEdit() {
    if (!draft || !selected) return;
    // Send only the fields that changed so an editor-tier client doesn't
    // clobber a staff member's concurrent edits to the other fields.
    const patch: Record<string, string | null> = {};
    if (draft.headline !== selected.headline) patch.headline = draft.headline;
    if (draft.copy !== selected.copy) patch.copy = draft.copy;
    if (draft.cta !== selected.cta) patch.cta = draft.cta;
    if (Object.keys(patch).length === 0) {
      toast("No changes to save.", "info");
      return;
    }
    setActing(true);
    const { error } = await supabase
      .from("ads")
      .update(patch)
      .eq("id", selected.id);
    setActing(false);
    if (error) return toast(error.message, "error");
    toast("Saved.", "success");
    refresh();
  }

  async function changeSetStatus(next: SetStatus) {
    if (next === setStatus) return;
    const { error } = await supabase.rpc("client_set_status", {
      p_set_id: setId,
      p_status: next,
    });
    if (error) return toast(error.message, "error");
    toast(
      next === "approved" ? "Set approved." : "Changes requested.",
      "success",
    );
    refresh();
  }

  const openComments = selected?.comments.filter((c) => !c.resolved).length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-3.5 sm:px-6">
        <Logo
          src={client.logo_url}
          name={client.name}
          imgClassName="h-7 w-7 shrink-0 rounded object-cover"
        />
        <strong className="truncate text-sm">{client.name}</strong>
        <span className="hidden truncate text-sm text-neutral-400 sm:inline">
          — {setName}
        </span>
        <Link href="/c" className="ml-auto shrink-0 text-xs text-indigo-300 hover:text-white">
          ← All reviews
        </Link>
        <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">
          {userEmail}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col text-sm lg:flex-row">
        {/* LEFT — creatives */}
        <aside
          aria-label="Creatives"
          className="flex w-full shrink-0 flex-col border-b border-neutral-800 bg-neutral-950 lg:w-60 lg:border-b-0 lg:border-r"
        >
          <div className="border-b border-neutral-800 px-4 py-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Status
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SET_STATUS_PILL[setStatus]}`}
              >
                {SET_STATUS_LABELS[setStatus]}
              </span>
            </div>
            {caps.approve && (
              <>
                <p className="mb-1.5 text-[11px] text-neutral-500">
                  Whole set — approve once you&apos;re happy with everything, or
                  send it back for changes.
                </p>
                <div className="flex gap-1.5">
                  <ActionButton
                    onClick={() => changeSetStatus("approved")}
                    disabled={setStatus === "approved"}
                    busyLabel="…"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Approve set
                  </ActionButton>
                  <ActionButton
                    onClick={() => changeSetStatus("needs_revisions")}
                    disabled={setStatus === "needs_revisions"}
                    busyLabel="…"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-2 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Request changes
                  </ActionButton>
                </div>
              </>
            )}
          </div>
          {notes && (
            <div className="border-b border-neutral-800 px-4 py-3 text-xs text-neutral-400">
              {notes}
            </div>
          )}
          <div className="max-h-52 overflow-y-auto p-2 lg:max-h-none lg:flex-1">
            {initialCreatives.length === 0 ? (
              <p className="px-2 py-3 text-xs text-neutral-500">
                Nothing to review yet.
              </p>
            ) : (
              initialCreatives.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
                    c.id === selectedId
                      ? "bg-indigo-500/15 text-indigo-200"
                      : "hover:bg-neutral-900"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {c.name || c.format}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {c.format}
                    </span>
                  </span>
                  <span
                    role="img"
                    aria-label={`Status: ${creativeStatusLabel(c.status)}`}
                    className={`h-2 w-2 shrink-0 rounded-full ${creativeStatusDot(c.status)}`}
                    title={creativeStatusLabel(c.status)}
                  />
                </button>
              ))
            )}
          </div>
          {/* Legend so the status dots aren't color-only (and aren't a mystery
              to a non-technical client). */}
          {initialCreatives.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-neutral-600" /> Pending
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" /> Approved
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Needs edits
              </span>
            </div>
          )}
        </aside>

        {/* CENTER — preview (centered, zoom pinned bottom) */}
        <section className="relative flex min-h-[55vh] flex-col bg-neutral-950 lg:min-h-0 lg:flex-1">
          <div className="flex-1 overflow-auto">
            <div className="flex min-h-full items-center justify-center p-6">
              {draft ? (
                <div className="w-full max-w-xl">
                  <MockupCanvas creative={draft} zoom={zoom} />
                </div>
              ) : (
                <div className="text-sm text-neutral-500">
                  Select a creative to review.
                </div>
              )}
            </div>
          </div>
          {draft && (
            <div className="flex justify-center border-t border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
              <ZoomBar zoom={zoom} setZoom={setZoom} />
            </div>
          )}
        </section>

        {/* RIGHT — Review (+ Edit for editor-tier) */}
        <aside
          aria-label="Review panel"
          className="flex w-full shrink-0 flex-col border-t border-neutral-800 bg-neutral-900 lg:w-96 lg:border-l lg:border-t-0"
        >
          {caps.edit && (
            <div role="tablist" aria-label="Panel" className="flex border-b border-neutral-800">
              {(["review", "edit"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-4 py-3 text-xs font-medium capitalize ${
                    tab === t
                      ? "border-b-2 border-indigo-500 text-indigo-300"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {t}
                  {t === "review" && openComments > 0 && (
                    <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-300">
                      {openComments}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {!selected ? (
              <p className="text-xs text-neutral-500">Nothing selected.</p>
            ) : caps.edit && tab === "edit" && draft ? (
              <div className="space-y-3">
                <EditInput label="Headline" value={draft.headline} onChange={(v) => setDraft({ ...draft, headline: v })} />
                <EditArea label="Copy" value={draft.copy} onChange={(v) => setDraft({ ...draft, copy: v })} />
                <EditInput label="CTA" value={draft.cta} onChange={(v) => setDraft({ ...draft, cta: v })} />
                <ActionButton
                  onClick={saveEdit}
                  disabled={acting}
                  busyLabel="Saving…"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save changes
                </ActionButton>
              </div>
            ) : (
              <>
                {/* One-line orientation so a first-time client knows what to do
                    on this screen without instructions. */}
                <p className="mb-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
                  Reviewing <strong className="text-neutral-200">{selected.name || selected.format}</strong>.{" "}
                  {caps.approve
                    ? "Leave feedback below, then Approve this creative or Request edits."
                    : caps.comment
                      ? "Leave your feedback below."
                      : "Browse the creatives in this set."}
                </p>
                {caps.approve && (
                  <div className="mb-3 flex gap-2">
                    <ActionButton
                      onClick={() => approve(selected.id, "approved")}
                      disabled={acting}
                      busyLabel="Approving…"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      onClick={() => approve(selected.id, "needs-edits")}
                      disabled={acting}
                      busyLabel="Requesting…"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Request edits
                    </ActionButton>
                  </div>
                )}

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">
                    {openComments} open · {selected.comments.length} total
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <input
                      type="checkbox"
                      checked={showResolved}
                      onChange={(e) => setShowResolved(e.target.checked)}
                    />
                    Show resolved
                  </label>
                </div>

                {(() => {
                  const list = selected.comments.filter(
                    (c) => showResolved || !c.resolved,
                  );
                  return list.length === 0 ? (
                    <p className="mb-3 text-xs text-neutral-500">
                      {selected.comments.length === 0
                        ? "No feedback yet."
                        : "No open feedback."}
                    </p>
                  ) : (
                    list.map((c) => (
                      <CommentBlock
                        key={c.id}
                        comment={c}
                        caps={caps}
                        onReply={reply}
                        onResolve={resolve}
                      />
                    ))
                  );
                })()}

                {caps.comment && (
                  <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                    <AddComment
                      onSubmit={(text, target) => comment(selected.id, text, target)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

type Caps = { comment: boolean; approve: boolean; resolve: boolean; edit: boolean };

function AddComment({
  onSubmit,
}: {
  onSubmit: (text: string, target: string) => Promise<unknown> | void;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>("General");
  return (
    <>
      <label className="block text-xs text-neutral-400">
        What&apos;s your feedback about?
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Feedback topic"
          className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
        >
          {TARGETS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        aria-label="Leave a comment"
        placeholder="Leave a comment…"
        className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
      />
      <ActionButton
        onClick={async () => {
          if (!text.trim()) return;
          await onSubmit(text, target);
          setText("");
        }}
        busyLabel="Posting…"
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        Comment
      </ActionButton>
    </>
  );
}

function CommentBlock({
  comment,
  caps,
  onReply,
  onResolve,
}: {
  comment: ReviewComment;
  caps: Caps;
  onReply: (commentId: string, text: string) => Promise<unknown> | void;
  onResolve: (commentId: string, resolved: boolean) => Promise<unknown> | void;
}) {
  const [text, setText] = useState("");
  return (
    <div
      className={`mb-2 rounded-lg border border-neutral-800 p-2.5 ${
        comment.resolved ? "bg-neutral-950 opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <strong>{comment.author}</strong>{" "}
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300">
            {comment.target}
          </span>
        </div>
        {caps.resolve && (
          <ActionButton
            onClick={() => onResolve(comment.id, !comment.resolved)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-300 hover:underline disabled:opacity-60"
          >
            {comment.resolved ? "Reopen" : "Resolve"}
          </ActionButton>
        )}
      </div>
      <div className="text-sm">{comment.text}</div>
      {comment.replies.map((r) => (
        <div
          key={r.id}
          className="ml-3 border-l-2 border-neutral-800 py-1 pl-2.5 text-sm"
        >
          <strong>{r.author}:</strong> {r.text}
        </div>
      ))}
      {caps.comment && (
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Reply"
            placeholder="Reply…"
            className="min-w-0 flex-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-100"
          />
          <ActionButton
            onClick={async () => {
              if (!text.trim()) return;
              await onReply(comment.id, text);
              setText("");
            }}
            busyLabel="…"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-neutral-800 disabled:opacity-60"
          >
            Reply
          </ActionButton>
        </div>
      )}
    </div>
  );
}

function EditInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-neutral-400">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
      />
    </label>
  );
}

function EditArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-neutral-400">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
      />
    </label>
  );
}
