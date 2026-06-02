// Google Drive share link -> direct hotlinkable image URL.
//   https://drive.google.com/file/d/FILEID/view?usp=sharing
//   https://drive.google.com/open?id=FILEID
// Anything non-Drive (YouTube/Vimeo/.mp4/etc.) is returned unchanged.
export function driveDirectUrl(url: string | null | undefined): string {
  if (!url) return "";
  const m =
    url.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
    url.match(/[?&]id=([^&]+)/);
  // lh3 hotlink format — the legacy `uc?export=view` endpoint now often returns
  // an HTML interstitial instead of image bytes.
  if (m && m[1]) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  return url;
}
