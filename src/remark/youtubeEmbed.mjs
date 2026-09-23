// Upgrades a specific markdown pattern — a YouTube thumbnail image wrapped
// in a link to that same video — into a real embedded, playable iframe.
//
// Source docs (hand-authored or synced from a submodule, e.g.
// docs/drivers/Adaptive grippers/Libraries/C++/docs/01-environment-setup.md)
// deliberately keep the plain thumbnail-link form, not a raw <iframe>,
// because those files are also read as plain CommonMark outside this site
// (e.g. previewed raw on GitHub), which strips <iframe> tags entirely for
// security — leaving nothing where a clickable thumbnail would otherwise be.
// This plugin is what upgrades that same portable markup to a real player
// specifically for this site's build, so the source only has to be written
// once. See the matching comment left in that markdown source itself.
//
// Scoped narrowly to avoid false positives: only fires on a paragraph
// containing exactly one link containing exactly one image, where the
// image points at YouTube's thumbnail CDN and the link points at the
// matching video (same id) — an ordinary "here's an image, and separately
// it happens to link somewhere" paragraph never matches both conditions on
// the same id.
//
// Emits a raw mdast `html` node rather than an MDX JSX element: unlike
// src/remark/robotiqWordmark.mjs (opt-in markup only ever hand-authored in
// this site's own .mdx pages), this plugin also runs over synced docs
// rendered in plain-CommonMark mode (see markdown.format: 'detect' in
// docusaurus.config.js) — a raw `html` node is exactly what mdast already
// uses for the hand-written raw HTML (`<table>`, `<br>`, ...) those pages
// rely on, and flows through the same remark-rehype + rehype-raw path
// Docusaurus already runs for both plain Markdown and MDX.
import {visit} from 'unist-util-visit';

const THUMBNAIL_RE = /^https:\/\/img\.youtube\.com\/vi\/([\w-]+)\//;
const VIDEO_LINK_RE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/;

export default function remarkYoutubeEmbed() {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index === null || node.children.length !== 1) return;

      const link = node.children[0];
      if (link.type !== 'link' || link.children.length !== 1) return;

      const image = link.children[0];
      if (image.type !== 'image') return;

      const thumbnailId = THUMBNAIL_RE.exec(image.url)?.[1];
      const linkId = VIDEO_LINK_RE.exec(link.url)?.[1];
      if (!thumbnailId || !linkId || thumbnailId !== linkId) return;

      const title = (image.alt || 'Video').replace(/"/g, '&quot;');
      parent.children[index] = {
        type: 'html',
        value: `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${thumbnailId}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`,
      };
    });
  };
}
