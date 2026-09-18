// Opens every external link (absolute http(s) URL — a GitHub repo, PyPI
// package, robotiq.com/support, ...) in a new tab, so following a
// "get the tool" / "reference" link out of the docs doesn't navigate the
// visitor away from the page they were reading. Internal doc-to-doc
// navigation is untouched: every such link in this site uses a relative
// path, never an absolute robotiq.github.io URL, so the http(s) check
// alone is enough to tell the two apart.
//
// A rehype (not remark) plugin, run on the hast tree — but a markdown
// `[text](url)` link (or an autolinked bare URL) and a raw JSX
// `<a href="...">` (e.g. the block-arrow GitHub button on the C++ SDK
// page) are NOT the same node shape even at this stage: mdast-util-to-hast
// converts the former into a plain hast `element` (tagName 'a'), but has
// no idea how to interpret arbitrary JSX, so it carries the latter through
// unchanged as an `mdxJsxFlowElement`/`mdxJsxTextElement` (name 'a') —
// confirmed by testing: the plugin caught every real markdown/autolinked
// link on the first pass, but silently skipped the hand-written JSX
// button until this second branch was added. Both need handling, each
// with that node type's own way of storing attributes (hast `properties`
// vs mdast-util-mdx-jsx's `attributes` array of {name, value} pairs).
import {visit} from 'unist-util-visit';

const JSX_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

function isExternal(href) {
  return typeof href === 'string' && /^https?:\/\//.test(href);
}

function jsxAttr(node, name) {
  return node.attributes?.find((attr) => attr.type === 'mdxJsxAttribute' && attr.name === name);
}

export default function rehypeExternalLinksNewTab() {
  return (tree) => {
    visit(tree, (node) => node.tagName === 'a' || (JSX_TYPES.has(node.type) && node.name === 'a'), (node) => {
      if (node.tagName === 'a') {
        if (!isExternal(node.properties?.href)) return;
        node.properties.target = '_blank';
        node.properties.rel = 'noopener noreferrer';
        return;
      }

      const href = jsxAttr(node, 'href');
      if (!isExternal(href?.value)) return;
      if (!jsxAttr(node, 'target')) {
        node.attributes.push({type: 'mdxJsxAttribute', name: 'target', value: '_blank'});
      }
      if (!jsxAttr(node, 'rel')) {
        node.attributes.push({type: 'mdxJsxAttribute', name: 'rel', value: 'noopener noreferrer'});
      }
    });
  };
}
