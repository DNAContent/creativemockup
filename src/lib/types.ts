// Row shapes used across the app. These mirror db/schema.sql. (For full type
// safety you can later generate types with `supabase gen types typescript`.)
//
// NOTE on naming: the app calls these "creatives" (they cover ads AND organic
// posts). The underlying DB table is still physically named "ads" — only the
// app/UI vocabulary is "creative". Keep `.from("ads")` in queries.

export type SetStatus =
  | "in_progress"
  | "needs_review"
  | "needs_revisions"
  | "approved"
  | "archived";

// Human labels for SetStatus, for UI.
export const SET_STATUS_LABELS: Record<SetStatus, string> = {
  in_progress: "In progress",
  needs_review: "Needs client review",
  needs_revisions: "Needs revisions",
  approved: "Approved",
  archived: "Archived",
};

// Distinct pill colors per set stage (dark-theme translucent).
export const SET_STATUS_PILL: Record<SetStatus, string> = {
  in_progress: "bg-sky-500/15 text-sky-300",
  needs_review: "bg-amber-500/15 text-amber-300",
  needs_revisions: "bg-orange-500/15 text-orange-300",
  approved: "bg-green-500/15 text-green-300",
  archived: "bg-neutral-700/40 text-neutral-400",
};

export type CreativeStatus = "pending" | "approved" | "needs-edits";

// Distinct pill colors per creative status.
export const CREATIVE_STATUS_PILL: Record<CreativeStatus, string> = {
  pending: "bg-neutral-700/40 text-neutral-300",
  approved: "bg-green-500/15 text-green-300",
  "needs-edits": "bg-red-500/15 text-red-300",
};

export type CommentTarget =
  | "General"
  | "Copy"
  | "Visual"
  | "Headline"
  | "CTA";

// Client permission tiers (ascending power); mirrors client_contacts.role.
export type ContactRole = "viewer" | "commenter" | "approver" | "editor";

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  viewer: "Can view",
  commenter: "Can comment",
  approver: "Can approve",
  editor: "Can edit",
};

// Granular per-contact capabilities (view is implicit — every contact can view).
export interface ContactCaps {
  can_comment: boolean;
  can_approve: boolean;
  can_edit: boolean;
}

export const DEFAULT_CONTACT_CAPS: ContactCaps = {
  can_comment: true,
  can_approve: false,
  can_edit: false,
};

export interface CreativeSet {
  id: string;
  client_id: string;
  name: string;
  slug: string | null;
  status: SetStatus;
  notes: string | null;
  due_date: string | null;
}

export interface Client {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  contact_email: string | null;
  brand_name: string | null;
  brand_logo: string | null;
  creative_sets?: CreativeSet[];
}

export interface Creative {
  id: string;
  set_id: string;
  position: number;
  name: string;
  format: string;
  status: CreativeStatus;
  brand_name: string;
  brand_logo: string;
  copy: string;
  headline: string;
  description: string;
  cta: string;
  email_subject: string;
  email_preheader: string;
  email_body: string;
  media_img: string;
  media_video: string;
  aspect_ratio: string;
  created_at: string;
}

// Creative formats — covers both paid ads and organic posts.
// Mirrors the renderer's supported formats (see lib/mockup/renderMockup.ts).
export const CREATIVE_FORMATS: { value: string; label: string }[] = [
  { value: "fb-post", label: "FB Feed Post" },
  { value: "fb-feed", label: "FB Feed Ad" },
  { value: "fb-story", label: "FB Story" },
  { value: "fb-reels", label: "FB Reels Ad" },
  { value: "ig-post", label: "IG Feed Post" },
  { value: "ig-feed-ad", label: "IG Feed Ad" },
  { value: "ig-story", label: "IG Story Ad" },
  { value: "ig-reels", label: "IG Reels Ad" },
  { value: "li-post", label: "LinkedIn Post" },
  { value: "linkedin", label: "LinkedIn Feed Ad" },
  { value: "li-message", label: "LinkedIn Message Ad" },
  { value: "email", label: "Email" },
  { value: "display-leaderboard", label: "Display — Leaderboard" },
  { value: "display-mrec", label: "Display — Medium Rect" },
  { value: "display-halfpage", label: "Display — Half Page" },
  { value: "display-mobile", label: "Display — Mobile Banner" },
  { value: "native-infeed", label: "Native — In-Feed" },
  { value: "native-widget", label: "Native — Widget" },
];

// Shape returned when reading a set's creatives with their comment threads.
export interface ReviewReply {
  id: string;
  author: string;
  text: string;
  created_at: string;
}
export interface ReviewComment {
  id: string;
  author: string;
  text: string;
  target: CommentTarget;
  resolved: boolean;
  created_at: string;
  replies: ReviewReply[];
}
export interface ReviewCreative extends Omit<Creative, "set_id"> {
  comments: ReviewComment[];
}
