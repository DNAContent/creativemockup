"use client";

import { useState } from "react";

// Renders a logo image with a graceful fallback: if the URL is missing OR the
// image fails to load (broken/expired URL), it shows the name's initial in a
// placeholder tile. Omit `fallbackClassName` for spots (e.g. headers) that
// should render nothing when there's no usable logo.
export default function Logo({
  src,
  name,
  imgClassName,
  fallbackClassName,
}: {
  src: string | null | undefined;
  name: string;
  imgClassName: string;
  fallbackClassName?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={imgClassName}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  }

  if (!fallbackClassName) return null;
  return (
    <div className={fallbackClassName} aria-hidden>
      {name.slice(0, 1).toUpperCase() || "?"}
    </div>
  );
}
