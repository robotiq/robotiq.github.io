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
// Emits a DIFFERENT node depending on whether the file being compiled is
// MDX or plain Markdown (see markdown.format: 'detect' in
// docusaurus.config.js, which decides this per file, by extension) —
// MDX and plain-Markdown pages go through different compilers, and a node
// valid for one throws in the other:
// - Plain Markdown (a synced .md guide): a raw mdast `html` node. That's
//   exactly what mdast already uses for the hand-written raw HTML
//   (`<table>`, `<br>`, ...) those pages rely on, and Docusaurus's
//   plain-Markdown pipeline runs rehype-raw, which is what lets it (and
//   this plugin's output) through to real HTML.
// - MDX (a hand-authored .mdx page): an `mdxJsxFlowElement` — the
//   JSX-flavoured node MDX's own compiler expects in place of a `paragraph`.
//   Docusaurus does NOT run rehype-raw for MDX, so a raw `html` node there
//   fails the build with "Cannot handle unknown node `raw`" — an earlier
//   version of this plugin emitted `html` unconditionally, which worked for
//   every synced .md guide tested but would have broken the first .mdx page
//   to actually use this pattern (caught in review before that happened).
import {visit} from 'unist-util-visit';

const THUMBNAIL_RE = /^https:\/\/img\.youtube\.com\/vi\/([\w-]+)\//;
const VIDEO_LINK_RE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/;

const IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

function buildHtmlNode(thumbnailId, title) {
  // Raw HTML text, so the title has to be escaped by hand — this is the
  // only one of the two node shapes where that's true (the MDX attribute
  // below is a plain AST string value, not text mdast-util-mdx-jsx has to
  // parse back out of markup, so it needs no escaping at all).
  const escapedTitle = title.replace(/"/g, '&quot;');
  return {
    type: 'html',
    value: `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${thumbnailId}" title="${escapedTitle}" allow="${IFRAME_ALLOW}" allowfullscreen></iframe></div>`,
  };
}

function mdxAttr(name, value) {
  return {type: 'mdxJsxAttribute', name, value};
}

function buildMdxNode(thumbnailId, title) {
  return {
    type: 'mdxJsxFlowElement',
    name: 'div',
    attributes: [mdxAttr('className', 'video-wrapper')],
    children: [
      {
        type: 'mdxJsxFlowElement',
        name: 'iframe',
        attributes: [
          mdxAttr('src', `https://www.youtube.com/embed/${thumbnailId}`),
          mdxAttr('title', title),
          mdxAttr('allow', IFRAME_ALLOW),
          // A bare, valueless attribute is JSX's own boolean-prop shorthand
          // (`<iframe allowFullScreen />`) — mdast-util-mdx-jsx represents
          // that as `value: null`, not `value: true`/`value: "true"`.
          mdxAttr('allowFullScreen', null),
        ],
        children: [],
      },
    ],
  };
}

export default function remarkYoutubeEmbed() {
  return (tree, file) => {
    const isMdx = file?.extname === '.mdx';

    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index === null || node.children.length !== 1) return;

      const link = node.children[0];
      if (link.type !== 'link' || link.children.length !== 1) return;

      const image = link.children[0];
      if (image.type !== 'image') return;

      const thumbnailId = THUMBNAIL_RE.exec(image.url)?.[1];
      const linkId = VIDEO_LINK_RE.exec(link.url)?.[1];
      if (!thumbnailId || !linkId || thumbnailId !== linkId) return;

      const title = image.alt || 'Video';
      parent.children[index] = isMdx
        ? buildMdxNode(thumbnailId, title)
        : buildHtmlNode(thumbnailId, title);
    });
  };
}
