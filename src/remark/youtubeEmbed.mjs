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
// Emits an `mdxJsxFlowElement` node — the JSX-flavoured node MDX's own
// compiler expects in place of a `paragraph` — for BOTH plain Markdown and
// MDX pages, unconditionally. An earlier version emitted a raw mdast
// `html` node instead: that works for plain Markdown (Docusaurus runs
// rehype-raw there, the same thing that lets hand-written raw HTML like
// `<table>`/`<br>` through), but Docusaurus does NOT run rehype-raw for
// MDX, so an `.mdx` page hitting this pattern failed the build outright
// with "Cannot handle unknown node `raw`" (caught in review, see PR #14 —
// no `.mdx` page happened to use this pattern yet, so it shipped unnoticed
// until then). Switching to `mdxJsxFlowElement` for every file, not just
// `.mdx` ones, is the simpler fix: remark-rehype's own `passThrough` list
// for plain-Markdown files already includes `mdxJsxFlowElement`, so it
// flows through untouched into real HTML there too — verified against a
// throwaway `.md` and `.mdx` page, both compiling and rendering the
// identical iframe. One node shape, no format branching, and no manual
// `&quot;`-escaping either (a JSX attribute is a plain AST string value,
// not text a parser has to read back out of markup).
import {visit} from 'unist-util-visit';

const THUMBNAIL_RE = /^https:\/\/img\.youtube\.com\/vi\/([\w-]+)\//;
const VIDEO_LINK_RE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/;

const IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

function mdxAttr(name, value) {
  return {type: 'mdxJsxAttribute', name, value};
}

export function buildEmbedNode(thumbnailId, title) {
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

// Extracts { thumbnailId } if `node` is a paragraph matching the pattern,
// else undefined. Exported as a pure function so the matching logic can be
// unit tested without going through a full remark/unified pipeline.
export function matchYoutubeParagraph(node) {
  if (!node || node.type !== 'paragraph' || node.children.length !== 1) return undefined;

  const link = node.children[0];
  if (link.type !== 'link' || link.children.length !== 1) return undefined;

  const image = link.children[0];
  if (image.type !== 'image') return undefined;

  const thumbnailId = THUMBNAIL_RE.exec(image.url)?.[1];
  const linkId = VIDEO_LINK_RE.exec(link.url)?.[1];
  if (!thumbnailId || !linkId || thumbnailId !== linkId) return undefined;

  return {thumbnailId, title: image.alt || 'Video'};
}

export default function remarkYoutubeEmbed() {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index === null) return;
      const match = matchYoutubeParagraph(node);
      if (!match) return;
      parent.children[index] = buildEmbedNode(match.thumbnailId, match.title);
    });
  };
}
