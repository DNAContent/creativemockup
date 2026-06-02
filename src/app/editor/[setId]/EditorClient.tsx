"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/client";
import CopyLink from "@/components/CopyLink";
import MockupCanvas, { ZoomBar } from "@/components/MockupCanvas";
import ActionButton from "@/components/ActionButton";
import { PlusIcon, Spinner } from "@/components/icons";
import {
  CREATIVE_FORMATS,
  SET_STATUS_LABELS,
  type Creative,
  type CreativeStatus,
  type ReviewComment,
  type SetStatus,
} from "@/lib/types";
import {
  addReply,
  createCreative,
  deleteCreative,
  renameSet,
  reorderCreatives,
  setCommentResolved,
  setSetStatus,
  updateCreative,
  type CreativeEdit,
} from "./actions";

export type EditorCreative = Creative & { comments: ReviewComment[] };

const EDIT_KEYS: (keyof CreativeEdit)[] = [
  "name", "format", "status", "brand_name", "brand_logo", "copy", "headline",
  "description", "cta", "email_subject", "email_preheader", "email_body",
  "media_img", "media_video", "aspect_ratio",
];

// Only the fields that actually changed since the last saved baseline. Sending
// a minimal patch (instead of the whole row) means two people editing DIFFERENT
// fields of the same creative don't clobber each other's work — only a true
// same-field collision is last-write-wins.
function changedPatch(
  c: EditorCreative,
  baseline: EditorCreative | null,
): CreativeEdit {
  if (!baseline || baseline.id !== c.id) {
    return Object.fromEntries(EDIT_KEYS.map((k) => [k, c[k]])) as CreativeEdit;
  }
  const patch: CreativeEdit = {};
  for (const k of EDIT_KEYS) {
    if (c[k] !== baseline[k]) (patch as Record<string, unknown>)[k] = c[k];
  }
  return patch;
}

export default function EditorClient({
  setId,
  setName,
  clientSlug,
  setSlug,
  status,
  initialCreatives,
}: {
  setId: string;
  setName: string;
  clientName: string;
  clientId: string;
  clientSlug: string | null;
  setSlug: string | null;
  status: SetStatus;
  initialCreatives: EditorCreative[];
}) {
  const router = useRouter();
  const { toast, confirm } = useToast();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const [creatives, setCreatives] = useState(initialCreatives);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCreatives[0]?.id ?? null,
  );
  const [tab, setTab] = useState<"edit" | "review">("edit");
  const [showResolved, setShowResolved] = useState(false);
  const [acting, setActing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [hl, setHl] = useState<string | null>(null);

  // Editable set name (re-syncs if the server name changes).
  const [nameDraft, setNameDraft] = useState(setName);
  const [prevName, setPrevName] = useState(setName);
  if (setName !== prevName) {
    setPrevName(setName);
    setNameDraft(setName);
  }
  async function saveName() {
    const v = nameDraft.trim();
    if (!v || v === setName) {
      setNameDraft(setName);
      return;
    }
    const res = await renameSet(setId, v);
    if (res.error) {
      setNameDraft(setName);
      return toast(res.error, "error");
    }
    toast("Set renamed.", "success");
    refresh();
  }

  // Re-sync from the server after a refresh / save, and keep selection sane.
  const [prevInitial, setPrevInitial] = useState(initialCreatives);
  if (initialCreatives !== prevInitial) {
    setPrevInitial(initialCreatives);
    setCreatives(initialCreatives);
    if (initialCreatives.length > prevInitial.length) {
      setSelectedId(initialCreatives[initialCreatives.length - 1].id); // select the new one
    } else if (!initialCreatives.some((c) => c.id === selectedId)) {
      setSelectedId(initialCreatives[0]?.id ?? null);
    }
  }

  const selected = creatives.find((c) => c.id === selectedId) ?? null;

  // Draft of the selected creative (drives the live preview). Keyed by id so a
  // realtime refresh of other rows never clobbers what you're typing; `dirty`
  // is measured against the values we last SAVED (savedRef), not against the
  // server row — so a teammate's change can't make us re-save our stale copy.
  const [draft, setDraft] = useState<EditorCreative | null>(selected);
  const [draftId, setDraftId] = useState<string | null>(selectedId);
  const savedRef = useRef<EditorCreative | null>(selected);
  const [saveState, setSaveState] = useState<
    "idle" | "unsaved" | "saving" | "saved"
  >("idle");
  // Load the selected creative into the draft whenever the selection changes.
  if (selectedId !== draftId) {
    setDraftId(selectedId);
    setDraft(selected);
    savedRef.current = selected;
    setSaveState("idle");
  }

  const dirty =
    !!draft &&
    !!savedRef.current &&
    draft.id === savedRef.current.id &&
    EDIT_KEYS.some((k) => draft[k] !== savedRef.current![k]);

  function field<K extends keyof EditorCreative>(key: K, value: EditorCreative[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  // flush = a background save of the OUTGOING creative on switch; it must not
  // touch savedRef/saveState (those now belong to the newly-selected creative).
  async function doSave(c: EditorCreative, flush = false) {
    // Diff against the baseline synchronously (before any await): on flush,
    // savedRef still points at the outgoing creative until the switch re-renders.
    const patch = changedPatch(c, savedRef.current);
    if (Object.keys(patch).length === 0) {
      if (!flush) setSaveState("saved");
      return;
    }
    if (!flush) setSaveState("saving");
    const res = await updateCreative(setId, c.id, patch);
    if (res.error) {
      if (!flush) setSaveState("unsaved");
      return toast(res.error, "error");
    }
    if (!flush) {
      savedRef.current = c;
      setSaveState("saved");
    }
    refresh();
  }

  // Debounced autosave (~1s after you stop typing); skips no-ops via `dirty`.
  useEffect(() => {
    if (!dirty || !draft) return;
    setSaveState("unsaved");
    const t = setTimeout(() => void doSave(draft), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  // Warn before leaving with a save still pending.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // Switch creative. Flush any unsaved edit to the outgoing creative in the
  // background (fire-and-forget) and switch immediately — selection never waits.
  function selectCreative(id: string) {
    if (id === selectedId) return;
    if (dirty && draft) void doSave(draft, true);
    setSelectedId(id);
  }

  // Realtime: refresh when this set's creatives / comments / replies change.
  // The socket must carry the user's token or RLS filters out every event.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => startTransition(() => router.refresh()), 300);
    };
    // Listeners attached synchronously (before subscribe); auth is async.
    const channel = supabase
      .channel(`editor-${setId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ads", filter: `set_id=eq.${setId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "replies" }, bump);
    // Defer the WebSocket handshake past first paint — live updates aren't
    // needed in the first second and the connect competes with hydration.
    const startTimer = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (data.session) supabase.realtime.setAuth(data.session.access_token);
        channel.subscribe();
      });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  async function onAdd() {
    setActing(true);
    const res = await createCreative(setId);
    setActing(false);
    if (res.error) return toast(res.error, "error");
    setTab("edit");
    toast("Creative added.", "success");
    refresh();
  }

  async function onStatus(next: SetStatus) {
    const res = await setSetStatus(setId, next);
    if (res.error) return toast(res.error, "error");
    toast("Set status updated.", "success");
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this creative? This cannot be undone."))) return;
    setActing(true);
    const res = await deleteCreative(setId, id);
    setActing(false);
    if (res.error) return toast(res.error, "error");
    toast("Creative deleted.", "success");
    refresh();
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= creatives.length) return;
    const next = [...creatives];
    [next[index], next[target]] = [next[target], next[index]];
    setCreatives(next); // optimistic
    const res = await reorderCreatives(setId, next.map((c) => c.id));
    if (res.error) {
      toast(res.error, "error");
      setCreatives(creatives);
      return;
    }
    refresh();
  }

  const openComments = selected?.comments.filter((c) => !c.resolved).length ?? 0;

  return (
    <div className="flex flex-col text-sm lg:h-[calc(100dvh-57px)] lg:flex-row">
      {/* LEFT — creatives in this set */}
      <aside className="flex w-full shrink-0 flex-col border-b border-neutral-800 bg-neutral-950 lg:w-60 lg:border-b-0 lg:border-r">
        <div className="border-b border-neutral-800 px-4 py-3">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            aria-label="Set name"
            title="Click to rename this set"
            className="w-full rounded border border-transparent !bg-transparent px-1 py-0.5 font-semibold text-neutral-100 hover:border-neutral-700 focus:border-neutral-700 focus:!bg-neutral-900 focus:outline-none"
          />
          <label className="mt-2 block text-[11px] text-neutral-500">
            Set status
            <select
              value={status}
              onChange={(e) => onStatus(e.target.value as SetStatus)}
              className="mt-1 w-full rounded-lg border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100"
            >
              {(Object.keys(SET_STATUS_LABELS) as SetStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2">
            <CopyLink clientSlug={clientSlug} setSlug={setSlug} />
          </div>
        </div>

        <div className="max-h-52 overflow-y-auto p-2 lg:max-h-none lg:flex-1">
          {creatives.length === 0 ? (
            <p className="px-2 py-3 text-xs text-neutral-500">No creatives yet.</p>
          ) : (
            creatives.map((c, i) => (
              <div
                key={c.id}
                className={`group mb-1 flex items-center gap-1 rounded-lg px-2 py-2 ${
                  c.id === selectedId
                    ? "bg-indigo-500/15 text-indigo-200"
                    : "hover:bg-neutral-900"
                }`}
              >
                <button
                  onClick={() => selectCreative(c.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate font-medium">
                    {c.name || "(unnamed)"}
                  </div>
                  <div className="truncate text-[11px] text-neutral-500">
                    {c.format}
                  </div>
                </button>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${statusDot(c.status)}`}
                  title={c.status}
                />
                <div className="flex flex-col opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="px-1.5 py-0.5 text-xs leading-none text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === creatives.length - 1}
                    className="px-1.5 py-0.5 text-xs leading-none text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-neutral-800 p-2">
          <button
            onClick={onAdd}
            disabled={acting}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {acting ? <Spinner className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
            {acting ? "Working…" : "Add creative"}
          </button>
        </div>
      </aside>

      {/* CENTER — live preview (centered, zoom pinned bottom) */}
      <section className="relative flex min-h-[55vh] flex-col bg-neutral-950 lg:min-h-0 lg:flex-1">
        <div className="flex-1 overflow-auto">
          <div className="flex min-h-full items-center justify-center p-6">
            {draft ? (
              <div className="w-full max-w-xl">
                <MockupCanvas creative={draft} zoom={zoom} highlightField={hl} />
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                Add or select a creative to preview it.
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

      {/* RIGHT — Edit / Review */}
      <aside className="flex w-full shrink-0 flex-col border-t border-neutral-800 bg-neutral-900 lg:w-96 lg:border-l lg:border-t-0">
        <div className="flex border-b border-neutral-800">
          {(["edit", "review"] as const).map((t) => (
            <button
              key={t}
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

        <div className="flex-1 overflow-y-auto p-4">
          {!draft || !selected ? (
            <p className="text-xs text-neutral-500">Nothing selected.</p>
          ) : tab === "edit" ? (
            <EditPanel draft={draft} field={field} setHl={setHl} />
          ) : (
            <ReviewList
              setId={setId}
              comments={selected.comments}
              showResolved={showResolved}
              onToggleResolved={setShowResolved}
              onChanged={refresh}
            />
          )}
        </div>

        {tab === "edit" && draft && selected && (
          <div className="flex items-center justify-between gap-2 border-t border-neutral-800 p-3">
            <ActionButton
              onClick={() => remove(selected.id)}
              disabled={acting}
              busyLabel="Deleting…"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400 hover:bg-red-500/15 disabled:opacity-50"
            >
              Delete
            </ActionButton>
            <span className="text-xs text-neutral-500">
              {saveState === "saving"
                ? "Saving…"
                : dirty || saveState === "unsaved"
                  ? "Unsaved — autosaving…"
                  : saveState === "saved"
                    ? "All changes saved ✓"
                    : ""}
            </span>
          </div>
        )}
      </aside>
    </div>
  );
}

function EditPanel({
  draft,
  field,
  setHl,
}: {
  draft: EditorCreative;
  field: <K extends keyof EditorCreative>(k: K, v: EditorCreative[K]) => void;
  setHl: (f: string | null) => void;
}) {
  const isEmail = draft.format === "email";
  // Highlight the matching mockup element while a field is focused.
  const hl = (f: string) => ({
    onFocus: () => setHl(f),
    onBlur: () => setHl(null),
  });
  return (
    <div className="space-y-3">
      <Text label="Name" value={draft.name} onChange={(v) => field("name", v)} />
      <Select
        label="Format"
        value={draft.format}
        onChange={(v) => field("format", v)}
        options={CREATIVE_FORMATS}
      />
      <Select
        label="Status"
        value={draft.status}
        onChange={(v) => field("status", v as CreativeStatus)}
        options={[
          { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" },
          { value: "needs-edits", label: "Needs edits" },
        ]}
      />

      {isEmail ? (
        <>
          <Text label="Email subject" value={draft.email_subject} onChange={(v) => field("email_subject", v)} {...hl("email_subject")} />
          <Text label="Email preheader" value={draft.email_preheader} onChange={(v) => field("email_preheader", v)} {...hl("email_preheader")} />
          <Area label="Email body" value={draft.email_body} onChange={(v) => field("email_body", v)} {...hl("email_body")} />
        </>
      ) : (
        <>
          <Text label="Headline" value={draft.headline} onChange={(v) => field("headline", v)} {...hl("headline")} />
          <Area label="Copy" value={draft.copy} onChange={(v) => field("copy", v)} {...hl("copy")} />
          <Text label="Description" value={draft.description} onChange={(v) => field("description", v)} {...hl("description")} />
          <Text label="CTA" value={draft.cta} onChange={(v) => field("cta", v)} {...hl("cta")} />
        </>
      )}

      <Text label="Aspect ratio" value={draft.aspect_ratio} onChange={(v) => field("aspect_ratio", v)} />
      <Text label="Media image (URL)" value={draft.media_img} onChange={(v) => field("media_img", v)} {...hl("media_img")} />
      <Text label="Media video URL" value={draft.media_video} onChange={(v) => field("media_video", v)} {...hl("media_video")} />
    </div>
  );
}

function ReviewList({
  setId,
  comments,
  showResolved,
  onToggleResolved,
  onChanged,
}: {
  setId: string;
  comments: ReviewComment[];
  showResolved: boolean;
  onToggleResolved: (v: boolean) => void;
  onChanged: () => void;
}) {
  const open = comments.filter((c) => !c.resolved).length;
  const list = comments.filter((c) => showResolved || !c.resolved);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          {open} open · {comments.length} total
        </span>
        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => onToggleResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-neutral-500">
          {comments.length === 0 ? "No feedback yet." : "No open feedback."}
        </p>
      ) : (
        list.map((c) => (
          <CommentRow key={c.id} setId={setId} comment={c} onChanged={onChanged} />
        ))
      )}
    </div>
  );
}

function CommentRow({
  setId,
  comment,
  onChanged,
}: {
  setId: string;
  comment: ReviewComment;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [replyText, setReplyText] = useState("");
  async function toggle() {
    setBusy(true);
    const res = await setCommentResolved(setId, comment.id, !comment.resolved);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    toast(comment.resolved ? "Reopened." : "Resolved.", "success");
    onChanged();
  }
  async function reply() {
    if (!replyText.trim()) return;
    const res = await addReply(setId, comment.id, replyText);
    if (res.error) return toast(res.error, "error");
    setReplyText("");
    toast("Reply sent.", "success");
    onChanged();
  }
  return (
    <div
      className={`mb-2 rounded-lg border p-2.5 ${
        comment.resolved
          ? "border-neutral-800 bg-neutral-950 opacity-60"
          : "border-neutral-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <strong>{comment.author}</strong>{" "}
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300">
            {comment.target}
          </span>
        </div>
        <ActionButton
          onClick={toggle}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-300 hover:underline disabled:opacity-50"
        >
          {comment.resolved ? "Reopen" : "Resolve"}
        </ActionButton>
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
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reply();
          }}
          placeholder="Reply to the client…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-100"
        />
        <ActionButton
          onClick={reply}
          busyLabel="Sending…"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-neutral-800 disabled:opacity-60"
        >
          Reply
        </ActionButton>
      </div>
    </div>
  );
}

function statusDot(status: string) {
  if (status === "approved") return "bg-green-500";
  if (status === "needs-edits") return "bg-red-500";
  return "bg-neutral-600";
}

function Text({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block text-xs text-neutral-500">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block text-xs text-neutral-500">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        rows={3}
        className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-xs text-neutral-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
