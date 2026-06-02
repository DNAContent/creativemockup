// Google Drive share link -> direct hotlinkable image URL.
//   https://drive.google.com/file/d/FILEID/view?usp=sharing
//   https://drive.google.com/open?id=FILEID
// Anything non-Drive (YouTube/Vimeo/.mp4/etc.) is returned unchanged.
export function driveDirectUrl(url: string | null | undefined): string {
  if (!url) return "";
  const m =
    url.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
    url.match(/[?&]id=([^&]+)/);
  if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  return url;
}
