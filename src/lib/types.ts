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

// One card in a carousel creative.
export interface CarouselSlide {
  img: string;
  headline: string;
  description: string;
  cta: string;
}

export const EMPTY_SLIDE: CarouselSlide = {
  img: "",
  headline: "",
  description: "",
  cta: "",
};

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
  // "single" (default) or "carousel" — see db/17. slides is the carousel cards.
  creative_type: string;
  slides: CarouselSlide[];
  created_at: string;
}

// Formats that can render as a carousel (the feed placements). Any other format
// ignores creative_type and always renders as a single creative.
export const CAROUSEL_FORMATS = new Set([
  "fb-feed",
  "fb-post",
  "ig-post",
  "ig-feed-ad",
  "instagram",
  "li-post",
  "linkedin",
]);

export function formatSupportsCarousel(format: string): boolean {
  return CAROUSEL_FORMATS.has(format);
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
  { value: "blog", label: "Blog Post" },
];

// CTA button options each ad platform offers, for the editor's CTA dropdown.
// (Mirrors what Meta / LinkedIn actually surface in their ad builders.)
export const META_CTAS = [
  "Learn More", "Shop Now", "Sign Up", "Subscribe", "Book Now", "Download",
  "Get Offer", "Get Quote", "Contact Us", "Apply Now", "Send Message",
  "Watch More", "Order Now", "Donate Now", "See Menu",
];
export const LINKEDIN_CTAS = [
  "Learn More", "Sign Up", "Download", "Subscribe", "Register", "Apply Now",
  "Request Demo", "Join", "Attend", "View Quote", "Visit Website",
];
export const GENERIC_CTAS = [
  "Learn More", "Shop Now", "Sign Up", "Subscribe", "Download", "Get Offer",
  "Get Quote", "Contact Us", "Apply Now", "Order Now", "Read More", "Get Started",
];

// Map a creative format to the CTA button options its platform provides.
export function ctaOptionsForFormat(format: string): string[] {
  if (format.startsWith("fb-") || format.startsWith("ig-") || format === "instagram")
    return META_CTAS;
  if (format.startsWith("li-") || format === "linkedin") return LINKEDIN_CTAS;
  return GENERIC_CTAS;
}

// Aspect-ratio choices for the editor dropdown (every format that renders media
// uses one). "Display dimensions" is the 1.91:1 landscape used by feed/display
// link ads — distinct from a clean 16:9.
export const ASPECT_RATIOS: { value: string; label: string }[] = [
  { value: "4:5", label: "4:5 — Portrait" },
  { value: "16:9", label: "16:9 — Landscape" },
  { value: "9:16", label: "9:16 — Vertical" },
  { value: "1:1", label: "1:1 — Square" },
  { value: "1.91:1", label: "Display dimensions (1.91:1)" },
];

// Which editable fields each format actually uses. Drives the editor form so it
// only shows the inputs that format renders (a FB post has no headline/CTA; a
// blog has a long article body) and stays in sync with renderMockup.ts.
export type CreativeFieldKey =
  | "copy"
  | "headline"
  | "description"
  | "cta"
  | "email_subject"
  | "email_preheader"
  | "email_body"
  | "media_img"
  | "media_video"
  | "aspect_ratio";

export type CreativeFieldSpec = {
  key: CreativeFieldKey;
  label: string;
  area?: boolean; // render a textarea
  big?: boolean; // taller textarea, for long-form writing
};

// Reusable field specs (labels follow common ad-platform wording).
const FLD = {
  copy: { key: "copy", label: "Primary text", area: true },
  headline: { key: "headline", label: "Headline" },
  description: { key: "description", label: "Description" },
  cta: { key: "cta", label: "Call to action" },
  img: { key: "media_img", label: "Image URL" },
  video: { key: "media_video", label: "Video URL" },
  aspect: { key: "aspect_ratio", label: "Aspect ratio (e.g. 1:1, 16:9)" },
} satisfies Record<string, CreativeFieldSpec>;

export const FORMAT_FIELDS: Record<string, CreativeFieldSpec[]> = {
  // Facebook
  "fb-post": [FLD.copy, FLD.img, FLD.video, FLD.aspect],
  "fb-feed": [FLD.copy, FLD.headline, FLD.description, FLD.cta, FLD.img, FLD.video, FLD.aspect],
  "fb-story": [FLD.cta, FLD.img, FLD.video],
  "fb-reels": [FLD.copy, FLD.cta, FLD.img, FLD.video],
  // Instagram
  "ig-post": [FLD.copy, { key: "headline", label: "Link label" }, FLD.img, FLD.video, FLD.aspect],
  "ig-feed-ad": [FLD.copy, { key: "headline", label: "Link label" }, FLD.img, FLD.video, FLD.aspect],
  "ig-story": [FLD.cta, FLD.img, FLD.video],
  "ig-reels": [FLD.copy, FLD.cta, FLD.img, FLD.video],
  // LinkedIn
  "li-post": [FLD.copy, FLD.img, FLD.video, FLD.aspect],
  linkedin: [FLD.copy, FLD.headline, FLD.description, FLD.cta, FLD.img, FLD.video, FLD.aspect],
  "li-message": [
    { key: "email_subject", label: "Subject" },
    { key: "email_body", label: "Message", area: true, big: true },
    FLD.cta,
  ],
  // Email
  email: [
    { key: "email_subject", label: "Subject line" },
    { key: "email_preheader", label: "Preheader" },
    FLD.headline,
    FLD.description,
    FLD.cta,
    { key: "email_body", label: "Body", area: true, big: true },
    FLD.img,
    FLD.video,
    FLD.aspect,
  ],
  // Display (fixed sizes — no aspect ratio)
  "display-leaderboard": [FLD.headline, FLD.cta, FLD.img],
  "display-mrec": [FLD.headline, FLD.cta, FLD.img],
  "display-halfpage": [FLD.headline, FLD.cta, FLD.img],
  "display-mobile": [FLD.headline, FLD.cta, FLD.img],
  // Native
  "native-infeed": [FLD.headline, FLD.description, FLD.cta, FLD.img, FLD.video, FLD.aspect],
  "native-widget": [FLD.headline, FLD.img, FLD.video],
  // Blog — long-form article with a thumbnail
  blog: [
    { key: "headline", label: "Title" },
    { key: "description", label: "Subtitle / excerpt" },
    { key: "media_img", label: "Thumbnail image URL" },
    { key: "aspect_ratio", label: "Thumbnail aspect ratio (e.g. 16:9)" },
    { key: "email_body", label: "Article body", area: true, big: true },
    { key: "cta", label: "Button label (optional)" },
  ],
};

// Any format not explicitly mapped falls back to the full field set.
export const DEFAULT_FORMAT_FIELDS: CreativeFieldSpec[] = [
  FLD.copy,
  FLD.headline,
  FLD.description,
  FLD.cta,
  FLD.img,
  FLD.video,
  FLD.aspect,
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
