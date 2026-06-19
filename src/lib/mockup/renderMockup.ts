// @ts-nocheck
/* eslint-disable */
// Vendored from `ad-mockup-viewer (6).html` (renderCanvas + media/avatar helpers).
// Static string-rendering port used by <MockupCanvas>. Each format branch returns
// the mockup HTML (the original set canvas.innerHTML + applyZoom). Fields are
// camelCase (see Ad); MockupCanvas maps the DB row before calling.
export type Ad = { [k: string]: any };

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function getGDriveID(url) { const m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }
// Google Drive "share" links (…/file/d/ID/view, open?id=ID, uc?id=ID) serve an
// HTML page, not the image bytes — so <img src> can't load them. Rewrite to the
// thumbnail endpoint, which returns the file itself and works cross-origin.
function toDirectImage(url) {
  if (!url || url.indexOf('drive.google.com') === -1) return url;
  var m = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1920' : url;
}
function getVimeoID(url) { const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/); return m ? m[1] : null; }

function mediaHTML(ad, square) {
  const imgURL = toDirectImage((ad.uploadedURL && ad.uploadedType === 'image') ? ad.uploadedURL : ad.mediaImg);
  const vidURL = ad.mediaVideo;
  const uploadedVid = (ad.uploadedURL && ad.uploadedType === 'video') ? ad.uploadedURL : null;
  const h = square ? 280 : 225;
  const errFallback = `onerror="this.parentElement.innerHTML='<div style=\\'min-height:180px;display:flex;align-items:center;justify-content:center;color:#ccc;flex-direction:column;gap:6px;\\'><i class=\\'ti ti-photo-off\\' style=\\'font-size:26px;\\'></i><span style=\\'font-size:12px;\\'>Could not load image</span></div>'"`;
  if (imgURL) { const sq = square ? 'aspect-ratio:1/1;object-fit:cover;' : ''; return `<img src="${esc(imgURL)}" style="width:100%;display:block;${sq}" ${errFallback} alt="" />`; }
  if (uploadedVid) return `<video src="${uploadedVid}" controls style="width:100%;display:block;"></video>`;
  if (vidURL) {
    const yt = vidURL.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (yt) return `<iframe width="100%" height="${h}" src="https://www.youtube.com/embed/${yt[1]}" frameborder="0" allowfullscreen></iframe>`;
    const gd = getGDriveID(vidURL);
    if (gd) return `<iframe width="100%" height="${h}" src="https://drive.google.com/file/d/${gd}/preview" frameborder="0" allowfullscreen allow="autoplay"></iframe>`;
    const vi = getVimeoID(vidURL);
    if (vi) return `<iframe width="100%" height="${h}" src="https://player.vimeo.com/video/${vi}" frameborder="0" allowfullscreen></iframe>`;
    return `<video src="${esc(vidURL)}" controls style="width:100%;display:block;"></video>`;
  }
  return null;
}

function phHTML(cls, label) { return `<div class="${cls}"><i class="ti ti-photo" style="font-size:28px;color:#ccc"></i><span style="font-size:13px;color:#ccc">${label}</span></div>`; }

function avatarHTML(cls, ad) {
  const i = (ad.brandName || 'YB').split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0,2);
  if (ad.brandLogo) return `<div class="${cls}"><img src="${esc(toDirectImage(ad.brandLogo))}" onerror="this.style.display='none'" alt="" /></div>`;
  return `<div class="${cls}">${esc(i)}</div>`;
}


/* ---- NEW MEDIA HELPERS ---- */
function mediaInner(ad) {
  var imgURL = toDirectImage((ad.uploadedURL && ad.uploadedType === 'image') ? ad.uploadedURL : (ad.mediaImg || ''));
  var vidURL = ad.mediaVideo || '';
  var uploadedVid = (ad.uploadedURL && ad.uploadedType === 'video') ? ad.uploadedURL : null;
  if (imgURL) return '<img src="' + esc(imgURL) + '" style="width:100%;height:100%;object-fit:cover;display:block;" alt="" />';
  // Video is wrapped in a vertically-centered frame (.media-vid-wrap) so a
  // landscape clip letterboxes SYMMETRICALLY rather than being top-aligned with
  // black above it. Iframe embeds have no intrinsic aspect, so they ride inside
  // a 16:9 .media-vid-frame; a real <video> knows its own ratio (object-fit).
  if (uploadedVid) return '<div class="media-vid-wrap"><video src="' + uploadedVid + '" controls></video></div>';
  if (vidURL) {
    var yt = vidURL.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (yt) return '<div class="media-vid-wrap"><div class="media-vid-frame"><iframe src="https://www.youtube.com/embed/' + yt[1] + '" frameborder="0" allowfullscreen></iframe></div></div>';
    var gd = getGDriveID(vidURL);
    if (gd) return '<div class="media-vid-wrap"><div class="media-vid-frame"><iframe src="https://drive.google.com/file/d/' + gd + '/preview" frameborder="0" allowfullscreen allow="autoplay"></iframe></div></div>';
    var vi = getVimeoID(vidURL);
    if (vi) return '<div class="media-vid-wrap"><div class="media-vid-frame"><iframe src="https://player.vimeo.com/video/' + vi + '" frameborder="0" allowfullscreen></iframe></div></div>';
    return '<div class="media-vid-wrap"><video src="' + esc(vidURL) + '" controls></video></div>';
  }
  return null;
}

function mediaBox(ad, containerClass, phClass, phLabel) {
  var ar = (ad.aspectRatio || '16:9').replace(':', '/');
  var inner = mediaInner(ad);
  var ph = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;"><i class="ti ti-photo" style="font-size:28px;color:#ccc"></i><span style="font-size:13px;color:#ccc">' + phLabel + '</span></div>';
  return '<div class="' + containerClass + ' media-ar" style="aspect-ratio:' + ar + ';position:relative;overflow:hidden;">' + (inner || ph) + '</div>';
}

function storyMediaHTML(ad) {
  var imgURL = toDirectImage((ad.uploadedURL && ad.uploadedType === 'image') ? ad.uploadedURL : (ad.mediaImg || ''));
  var vidURL = ad.mediaVideo || '';
  var uploadedVid = (ad.uploadedURL && ad.uploadedType === 'video') ? ad.uploadedURL : null;
  if (imgURL) return '<img class="story-bg" src="' + esc(imgURL) + '" alt="" />';
  if (uploadedVid) return '<video class="story-bg" src="' + uploadedVid + '" autoplay muted loop playsinline></video>';
  if (vidURL) {
    var yt = vidURL.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (yt) return '<div class="story-iframe-wrap"><iframe src="https://www.youtube.com/embed/' + yt[1] + '?autoplay=1&mute=1" frameborder="0" allowfullscreen allow="autoplay"></iframe></div>';
    var gd = getGDriveID(vidURL);
    if (gd) return '<div class="story-iframe-wrap"><iframe src="https://drive.google.com/file/d/' + gd + '/preview" frameborder="0" allow="autoplay"></iframe></div>';
    var vi = getVimeoID(vidURL);
    if (vi) return '<div class="story-iframe-wrap"><iframe src="https://player.vimeo.com/video/' + vi + '?autoplay=1&muted=1" frameborder="0" allowfullscreen></iframe></div>';
    return '<video class="story-bg" src="' + esc(vidURL) + '" autoplay muted loop playsinline></video>';
  }
  return null;
}

const SEE_MORE_CFG = {
  'fb-post': {limit:125,label:'See more',cls:'sm-fb'}, 'fb-feed': {limit:125,label:'See more',cls:'sm-fb'},
  'fb-reels': {limit:72,label:'more',cls:'sm-wh'}, 'ig-post': {limit:125,label:'more',cls:'sm-ig'},
  'ig-feed-ad': {limit:125,label:'more',cls:'sm-ig'}, 'instagram': {limit:125,label:'more',cls:'sm-ig'},
  'ig-reels': {limit:72,label:'more',cls:'sm-wh'}, 'li-post': {limit:140,label:'see more',cls:'sm-li'},
  'linkedin': {limit:140,label:'see more',cls:'sm-li'},
};
function smText(text, field, fmt) {
  if (!text) return '';
  var cfg = SEE_MORE_CFG[fmt];
  if (!cfg || text.length <= cfg.limit) return esc(text);
  var cut = cfg.limit;
  while (cut < text.length && text[cut] !== ' ' && cut < cfg.limit + 15) cut++;
  return esc(text.slice(0, cut)) + '<span class="see-more-btn ' + cfg.cls + '">... ' + cfg.label + '</span>';
}

// Carousel formats (mirror CAROUSEL_FORMATS in types.ts). Other formats ignore
// creative_type and render as a single creative.
var CAROUSEL_OK = { 'fb-feed':1, 'fb-post':1, 'ig-post':1, 'ig-feed-ad':1, 'instagram':1, 'li-post':1, 'linkedin':1 };

// A horizontal strip of carousel cards (image + optional headline/desc/CTA bar),
// used in place of the single media box for carousel creatives.
function carouselHTML(ad) {
  var slides = Array.isArray(ad.slides) ? ad.slides : [];
  var ar = (ad.aspectRatio || '1:1').replace(':', '/');
  if (!slides.length) {
    return '<div style="padding:0 12px;"><div style="aspect-ratio:' + ar + ';display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:#ececec;color:#aaa;border-radius:10px;"><i class="ti ti-carousel-horizontal" style="font-size:30px"></i><span style="font-size:13px">Add carousel slides</span></div></div>';
  }
  var cards = slides.map(function (s) {
    var img = toDirectImage(s.img || '');
    var media = img
      ? '<img src="' + esc(img) + '" style="width:100%;height:100%;object-fit:cover;display:block;" alt="" />'
      : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#ececec;color:#bbb;"><i class="ti ti-photo" style="font-size:26px"></i></div>';
    var bar = (s.headline || s.description || s.cta)
      ? '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f7f8fa;border-top:1px solid #e4e6eb;">'
          + '<div style="min-width:0;flex:1;">'
            + (s.headline ? '<div style="font-weight:600;font-size:13px;color:#050505;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(s.headline) + '</div>' : '')
            + (s.description ? '<div style="font-size:12px;color:#65676b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(s.description) + '</div>' : '')
          + '</div>'
          + (s.cta ? '<button style="flex:0 0 auto;border:none;background:#e4e6eb;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:600;color:#050505;">' + esc(s.cta) + '</button>' : '')
        + '</div>'
      : '';
    return '<div style="flex:0 0 86%;scroll-snap-align:center;border-radius:10px;overflow:hidden;border:1px solid #dadde1;background:#fff;">'
      + '<div style="aspect-ratio:' + ar + ';position:relative;overflow:hidden;background:#000;">' + media + '</div>'
      + bar
      + '</div>';
  }).join('');
  var dots = slides.map(function (_s, i) {
    return '<span style="width:6px;height:6px;border-radius:50%;display:inline-block;background:' + (i === 0 ? '#1877f2' : '#c9ccd1') + ';"></span>';
  }).join('');
  return '<div style="position:relative;">'
    + '<div style="display:flex;gap:8px;overflow-x:auto;padding:2px 12px 6px;scroll-snap-type:x mandatory;">' + cards + '</div>'
    + '<div style="display:flex;gap:5px;justify-content:center;padding:6px 0 2px;">' + dots + '</div>'
    + '</div>';
}

export function renderMockup(ad: Ad): string {
  const fmt = ad.format;
  const name = ad.brandName || 'Your Brand';
  const useCarousel = ad.creativeType === 'carousel' && CAROUSEL_OK[fmt];

  if (fmt === 'fb-feed' || fmt === 'fb-post') {
    var fbOrganic = fmt === 'fb-post';
    var fbSponsorLine = fbOrganic ? 'Just now &nbsp;&middot;&nbsp; <i class="ti ti-world" style="font-size:11px"></i>' : 'Sponsored &nbsp;&middot;&nbsp; <i class="ti ti-world" style="font-size:11px"></i>';
    var fbCtaBar = fbOrganic ? '' : '<div class="fb-cta-bar"><div class="fb-cta-info"><div class="fb-cta-url">yourbrand.com</div><div class="fb-cta-headline">' + esc(ad.headline) + '</div>' + (ad.desc ? '<div class="fb-cta-desc">' + esc(ad.desc) + '</div>' : '') + '</div><div class="fb-cta-btn">' + esc(ad.cta) + '</div></div>';
    if (useCarousel) fbCtaBar = '';  // each carousel card carries its own headline/CTA
    return '<div id="zoom-target"><div class="fb-card">' +
      '<div class="fb-header">' + avatarHTML('fb-avatar', ad) + '<div class="fb-meta"><div class="fb-name">' + esc(name) + '</div><div class="fb-sponsored">' + fbSponsorLine + '</div></div><div class="fb-more">...</div></div>' +
      (ad.copy ? '<div class="fb-copy">' + smText(ad.copy, 'copy', fmt) + '</div>' : '') +
      (useCarousel ? carouselHTML(ad) : mediaBox(ad, 'fb-media', 'fb-media-ph', 'Add image or video')) +
      fbCtaBar +
      '<div class="fb-actions"><div class="fb-action"><i class="ti ti-thumb-up"></i> Like</div><div class="fb-action"><i class="ti ti-message-circle"></i> Comment</div><div class="fb-action"><i class="ti ti-share"></i> Share</div></div>' +
    '</div></div>';

    } else if (fmt === 'fb-story') {
    const storyBg = storyMediaHTML(ad);
    return `<div id="zoom-target"><div class="story-card">
      ${storyBg || `<div class="story-bg-ph"><i class="ti ti-photo" style="font-size:40px;color:#48484a"></i><span style="font-size:13px;color:#48484a">Add image or video</span></div>`}
      <div class="story-progress"><div class="story-prog-bar"><div class="story-prog-fill"></div></div><div class="story-prog-bar"></div><div class="story-prog-bar"></div></div>
      <div class="story-header">${avatarHTML('story-avatar', ad)}<div><div class="story-brand">${esc(name)}</div><div class="story-sponsored-tag">Sponsored</div></div></div>
      <div class="story-overlay"></div>
      <div class="story-cta">${esc(ad.cta)} →</div>
    </div></div>`;

  } else if (fmt === 'ig-post' || fmt === 'ig-feed-ad') {
    var igSponsored = fmt === 'ig-feed-ad';
    return '<div id="zoom-target"><div class="insta-card">' +
      '<div class="insta-header">' + avatarHTML('insta-avatar', ad) + '<div class="insta-username">' + esc(name) + '</div><div class="insta-sponsored-tag">' + (igSponsored ? 'Sponsored' : '') + '</div></div>' +
      (useCarousel ? carouselHTML(ad) : mediaBox(ad, 'insta-media', 'insta-media-ph', 'Add image or video')) +
      '<div class="insta-actions"><i class="ti ti-heart insta-action-i"></i><i class="ti ti-message-circle insta-action-i"></i><i class="ti ti-send insta-action-i"></i></div>' +
      (ad.copy ? '<div class="insta-caption"><strong>' + esc(name) + '</strong> ' + smText(ad.copy, 'copy', fmt) + '</div>' : '') +
      '<div class="insta-cta-link">' + esc(ad.headline) + '</div>' +
    '</div></div>';

    } else if (fmt === 'instagram') {
    return `<div id="zoom-target"><div class="insta-card">
      <div class="insta-header">${avatarHTML('insta-avatar', ad)}<div class="insta-username">${esc(name)}</div><div class="insta-sponsored-tag">Sponsored</div></div>
      ${useCarousel ? carouselHTML(ad) : mediaBox(ad, 'insta-media', 'insta-media-ph', 'Add image or video')}
      <div class="insta-actions"><i class="ti ti-heart insta-action-i"></i><i class="ti ti-message-circle insta-action-i"></i><i class="ti ti-send insta-action-i"></i></div>
      ${ad.copy ? `<div class="insta-caption"><strong>${esc(name)}</strong> ${smText(ad.copy, 'copy', fmt)}</div>` : ''}
      <div class="insta-cta-link">${esc(ad.headline)}</div>
    </div></div>`;

  } else if (fmt === 'li-post') {
    return '<div id="zoom-target"><div class="li-card">' +
      '<div class="li-header">' + avatarHTML('li-avatar', ad) + '<div class="li-meta"><div class="li-name">' + esc(name) + '</div><div class="li-title">Just now · <i class="ti ti-world" style="font-size:11px;vertical-align:-1px"></i></div></div><div class="li-more">...</div></div>' +
      (ad.copy ? '<div class="li-copy">' + smText(ad.copy, 'copy', fmt) + '</div>' : '') +
      (useCarousel ? carouselHTML(ad) : mediaBox(ad, 'li-media', 'li-media-ph', 'Add image or video')) +
      '<div class="li-actions"><div class="li-action"><i class="ti ti-thumb-up"></i> Like</div><div class="li-action"><i class="ti ti-message-circle"></i> Comment</div><div class="li-action"><i class="ti ti-repeat"></i> Repost</div><div class="li-action"><i class="ti ti-send"></i> Send</div></div>' +
    '</div></div>';

    } else if (fmt === 'linkedin') {
    return `<div id="zoom-target"><div class="li-card">
      <div class="li-header">${avatarHTML('li-avatar', ad)}<div class="li-meta"><div class="li-name">${esc(name)}</div><div class="li-title">Sponsored · <i class="ti ti-world" style="font-size:11px;vertical-align:-1px"></i></div></div><div class="li-more">···</div></div>
      ${ad.copy ? `<div class="li-copy">${smText(ad.copy, 'copy', fmt)}</div>` : ''}
      ${useCarousel ? carouselHTML(ad) : mediaBox(ad, 'li-media', 'li-media-ph', 'Add image or video')}
      ${useCarousel ? '' : `<div class="li-cta-bar"><div class="li-cta-info"><div class="li-cta-headline">${esc(ad.headline)}</div>${ad.desc ? `<div class="li-cta-desc">${esc(ad.desc)}</div>` : ''}</div><button class="li-cta-btn">${esc(ad.cta)}</button></div>`}
      <div class="li-actions"><div class="li-action"><i class="ti ti-thumb-up"></i> Like</div><div class="li-action"><i class="ti ti-message-circle"></i> Comment</div><div class="li-action"><i class="ti ti-repeat"></i> Repost</div><div class="li-action"><i class="ti ti-send"></i> Send</div></div>
    </div></div>`;

  } else if (fmt === 'email') {
    const heroInner = mediaInner(ad);
    const arCSS = (ad.aspectRatio || '16:9').replace(':', '/');
    const heroMediaHTML = heroInner
      ? `<div style="aspect-ratio:${arCSS};overflow:hidden;border-radius:6px;margin-bottom:18px;position:relative;">${heroInner}</div>`
      : `<div class="email-hero-ph"><i class="ti ti-photo" style="font-size:26px"></i><span>Add image or video</span></div>`;
    return `<div id="zoom-target"><div class="email-chrome">
      <div class="email-chrome-bar"><div class="email-dot" style="background:#ff5f57"></div><div class="email-dot" style="background:#febc2e"></div><div class="email-dot" style="background:#28c840"></div><div class="email-chrome-addr">Mail — Inbox</div></div>
      <div class="email-meta"><div class="email-from"><strong>${esc(name)}</strong> &lt;hello@yourbrand.com&gt;</div><div class="email-subject-line">${esc(ad.emailSubject)}</div><div class="email-preheader">${esc(ad.emailPreheader)}</div></div>
      <div class="email-body">
        <div class="email-hero">
          ${heroMediaHTML}
          <div class="email-hero-hl">${esc(ad.headline)}</div>
          ${ad.desc ? `<div class="email-hero-desc">${esc(ad.desc)}</div>` : ''}
          <a href="#" class="email-hero-btn">${esc(ad.cta)}</a>
        </div>
        <div class="email-content"><div class="email-body-text">${esc(ad.emailBody).replace(/\n/g,'<br>')}</div></div>
        <div class="email-footer">© 2025 ${esc(name)} &nbsp;·&nbsp; <a href="#" style="color:#aaa">Unsubscribe</a> &nbsp;·&nbsp; <a href="#" style="color:#aaa">Privacy Policy</a><br>123 Your Street, City, State 00000</div>
      </div>
    </div></div>`;

  } else if (fmt === 'fb-reels' || fmt === 'ig-reels') {
    const storyBg = storyMediaHTML(ad);
    const isIG = fmt === 'ig-reels';
    return `<div id="zoom-target"><div class="reels-card">
      <div class="reels-progress"><div class="reels-progress-fill"></div></div>
      ${storyBg || `<div class="reels-bg-ph"><i class="ti ti-photo" style="font-size:40px"></i><span>Add image or video</span></div>`}
      <div class="reels-top">
        <span class="reels-top-label">${isIG ? 'Reels' : 'Reels'}</span>
        <i class="ti ti-camera" style="color:#fff;font-size:20px"></i>
      </div>
      <div class="reels-side">
        <div class="reels-action"><i class="ti ti-heart"></i><span>14k</span></div>
        <div class="reels-action"><i class="ti ti-message-circle"></i><span>82</span></div>
        <div class="reels-action"><i class="ti ti-send"></i><span>Share</span></div>
        <div class="reels-action" style="margin-top:4px"><i class="ti ti-dots-vertical" style="font-size:20px"></i></div>
      </div>
      <div class="reels-bottom">
        <div class="reels-avatar-row">
          ${avatarHTML('reels-avatar', ad)}
          <div><div class="reels-username">${esc(name)}</div><div class="reels-sponsored">Sponsored</div></div>
        </div>
        ${ad.copy ? `<div class="reels-caption" style="display:block;overflow:visible;-webkit-line-clamp:unset;">${smText(ad.copy, 'copy', fmt)}</div>` : ''}
        <div class="reels-cta"><i class="ti ti-external-link" style="font-size:14px"></i> ${esc(ad.cta)}</div>
      </div>
    </div></div>`;

  } else if (fmt === 'ig-story') {
    const storyBg = storyMediaHTML(ad);
    const initials = (name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2));
    return `<div id="zoom-target"><div class="ig-story-card">
      ${storyBg || `<div class="ig-story-bg-ph"><i class="ti ti-photo" style="font-size:40px;color:#48484a"></i><span style="font-size:13px;color:#48484a">Add image or video</span></div>`}
      <div class="ig-story-top">
        <div class="ig-story-bars">
          <div class="ig-story-bar"><div class="ig-story-bar-fill"></div></div>
          <div class="ig-story-bar"></div><div class="ig-story-bar"></div>
        </div>
        <div class="ig-story-header">
          <div class="ig-story-avatar"><div class="ig-story-avatar-inner">
            ${ad.brandLogo ? `<img src="${esc(toDirectImage(ad.brandLogo))}" alt="" />` : esc(initials)}
          </div></div>
          <div><div class="ig-story-name">${esc(name)}</div><div class="ig-story-tag">Sponsored</div></div>
        </div>
      </div>
      <div class="ig-story-overlay"></div>
      <div class="ig-story-cta">${esc(ad.cta)} →</div>
    </div></div>`;

  } else if (fmt === 'li-message') {
    const initials = (name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2));
    return `<div id="zoom-target"><div class="li-msg-chrome">
      <div class="li-msg-topbar">
        <div class="li-msg-topbar-logo"><svg viewBox="0 0 20 20" fill="#0a66c2"><path d="M16.7 2H3.3C2.6 2 2 2.6 2 3.3v13.4c0 .7.6 1.3 1.3 1.3h13.4c.7 0 1.3-.6 1.3-1.3V3.3c0-.7-.6-1.3-1.3-1.3zM7 15H4.5V8H7v7zm-1.25-8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm9.25 8h-2.5v-3.5c0-1-.8-1.5-1.5-1.5s-1.5.7-1.5 1.5V15H7.5V8H10v.9c.5-.8 1.5-1.4 2.5-1.4 1.9 0 2.5 1.3 2.5 3V15z"/></svg></div>
        <span class="li-msg-topbar-title">LinkedIn Message</span>
      </div>
      <div class="li-msg-header">
        <div class="li-msg-from-row">
          ${avatarHTML('li-msg-avatar', ad)}
          <div class="li-msg-from-info">
            <div class="li-msg-from-name">${esc(name)}</div>
            <div class="li-msg-from-tag">Sponsored · Message Ad</div>
          </div>
        </div>
        <div class="li-msg-subject">${esc(ad.emailSubject || ad.headline)}</div>
        <div class="li-msg-date">Just now</div>
      </div>
      <div class="li-msg-body">${esc(ad.emailBody || ad.copy).replace(/\n/g,'<br>')}</div>
      <div class="li-msg-cta-wrap"><a class="li-msg-cta" href="#">${esc(ad.cta)}</a></div>
      <div class="li-msg-footer">You received this message because you match the advertiser's target audience. <a href="#" style="color:#0a66c2">Unsubscribe</a></div>
    </div></div>`;

  } else if (fmt.startsWith('display-')) {
    const inner = mediaInner(ad);
    const imgPH = '<div class="display-img-ph"><i class="ti ti-photo" style="font-size:22px"></i></div>';
    const logo = ad.brandLogo ? `<img src="${esc(toDirectImage(ad.brandLogo))}" alt="" />` : '';
    const dims = {'display-leaderboard':'728 × 90','display-mrec':'300 × 250','display-halfpage':'300 × 600','display-mobile':'320 × 50'};
    const unitClass = {'display-leaderboard':'display-leaderboard-unit','display-mrec':'display-mrec-unit','display-halfpage':'display-halfpage-unit','display-mobile':'display-mobile-unit'};
    const isHoriz = fmt === 'display-leaderboard' || fmt === 'display-mobile';
    const imgStyle = fmt === 'display-mrec' ? 'height:160px' : fmt === 'display-halfpage' ? 'height:380px' : '';
    return `<div id="zoom-target"><div class="display-wrap">
      <div class="display-label">${dims[fmt] || ''}</div>
      <div class="display-unit ${unitClass[fmt] || ''}">
        <div class="display-ad-tag">Ad</div>
        <div class="display-img" style="${imgStyle}">${inner ? inner.replace('width:100%;height:100%;object-fit:cover;display:block;','width:100%;height:100%;object-fit:cover;display:block;') : imgPH}</div>
        <div class="display-body">
          <div class="display-logo">${logo}</div>
          <div class="display-text">
            <div class="display-headline">${esc(ad.headline)}</div>
            <div class="display-brand">${esc(name)}</div>
          </div>
          <div class="display-cta-pill">${esc(ad.cta)}</div>
        </div>
      </div>
    </div></div>`;

  } else if (fmt === 'native-infeed') {
    const inner = mediaInner(ad);
    const ar = (ad.aspectRatio || '16:9').replace(':','/');
    const mediaSect = inner
      ? `<div class="native-infeed-img" style="aspect-ratio:${ar};position:relative;">${inner}</div>`
      : `<div class="native-infeed-img"><div class="native-infeed-img-ph"><i class="ti ti-photo" style="font-size:28px"></i></div></div>`;
    return `<div id="zoom-target"><div class="native-infeed-wrap">
      <div class="native-infeed-publisher">
        <p>…continuing from the article above. The researchers noted that results varied significantly across demographics, with younger cohorts showing markedly different patterns of engagement.</p>
      </div>
      <div class="native-infeed-card">
        ${mediaSect}
        <div class="native-infeed-body">
          <div class="native-infeed-sponsored">Sponsored</div>
          <div class="native-infeed-headline">${esc(ad.headline)}</div>
          ${ad.desc ? `<div class="native-infeed-desc">${esc(ad.desc)}</div>` : ''}
          <div class="native-infeed-footer">
            <span class="native-infeed-source">${esc(name)}</span>
            <span class="native-infeed-cta">${esc(ad.cta)}</span>
          </div>
        </div>
      </div>
    </div></div>`;

  } else if (fmt === 'native-widget') {
    const inner = mediaInner(ad);
    const phCard = (label) => `<div class="native-card-img-ph"><i class="ti ti-photo" style="font-size:18px"></i></div>`;
    const sponsoredImg = inner ? `<div class="native-card-img" style="position:relative;">${inner}</div>` : `<div class="native-card-img">${phCard()}</div>`;
    return `<div id="zoom-target"><div class="native-publisher" style="width:520px">
      <div class="native-article-body">
        <p>…the study concluded that further research is needed before definitive conclusions can be drawn. Experts recommend consulting professionals before making any major decisions based on these findings.</p>
      </div>
      <div class="native-widget-container">
        <div class="native-widget-header">Sponsored content</div>
        <div class="native-grid">
          <div class="native-card sponsored">
            ${sponsoredImg}
            <div class="native-card-body">
              <div class="native-card-headline">${esc(ad.headline)}</div>
              <div class="native-card-source"><span class="sp-tag">Ad</span> ${esc(name)}</div>
            </div>
          </div>
          <div class="native-card">
            <div class="native-card-img" style="background:#ddd;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;"><i class="ti ti-photo" style="font-size:18px;color:#bbb"></i></div>
            <div class="native-card-body">
              <div class="native-card-headline">10 things experts say you should know this year</div>
              <div class="native-card-source">Publisher Weekly</div>
            </div>
          </div>
          <div class="native-card">
            <div class="native-card-img" style="background:#d5e8d4;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;"><i class="ti ti-photo" style="font-size:18px;color:#bbb"></i></div>
            <div class="native-card-body">
              <div class="native-card-headline">How one company changed the way we think about this</div>
              <div class="native-card-source">The Daily Brief</div>
            </div>
          </div>
        </div>
      </div>
    </div></div>`;

  } else if (fmt === 'blog') {
    var thumbAR = (ad.aspectRatio || '16:9').replace(':', '/');
    var thumbInner = mediaInner(ad);
    var thumb = thumbInner
      ? '<div style="aspect-ratio:' + thumbAR + ';position:relative;overflow:hidden;">' + thumbInner + '</div>'
      : '<div style="aspect-ratio:' + thumbAR + ';display:flex;align-items:center;justify-content:center;background:#ececec;"><i class="ti ti-photo" style="font-size:34px;color:#bbb"></i></div>';
    var blogBody = esc(ad.emailBody || '').replace(/\n\s*\n/g, '</p><p>').replace(/\n/g, '<br>');
    return '<div id="zoom-target"><div style="width:640px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.14);font-family:Georgia,\'Times New Roman\',serif;color:#1a1a1a;">' +
      thumb +
      '<div style="padding:34px 40px 42px;">' +
        '<div style="font-family:system-ui,sans-serif;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">' + esc(name) + '</div>' +
        '<h1 class="blog-headline" style="font-size:30px;line-height:1.2;margin:0 0 14px;font-weight:700;">' + esc(ad.headline || 'Your article title') + '</h1>' +
        (ad.desc ? '<div class="blog-desc" style="font-size:17px;line-height:1.5;color:#555;font-style:italic;margin-bottom:24px;">' + esc(ad.desc) + '</div>' : '') +
        (blogBody
          ? '<div class="email-body-text" style="font-size:17px;line-height:1.78;"><p>' + blogBody + '</p></div>'
          : '<div class="email-body-text" style="font-size:15px;color:#aaa;font-style:italic;">Write your article body…</div>') +
        (ad.cta ? '<div style="margin-top:28px;"><a href="#" class="blog-cta" style="display:inline-block;background:#1a1a1a;color:#fff;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;padding:11px 22px;border-radius:6px;text-decoration:none;">' + esc(ad.cta) + '</a></div>' : '') +
      '</div>' +
    '</div></div>';

  }
  return '<div style="padding:40px;color:#999;text-align:center;font:14px system-ui">No preview for this format.</div>';
}
