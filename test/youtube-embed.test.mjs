// Unit tests for src/remark/youtubeEmbed.mjs.
//
// matchYoutubeParagraph is tested directly against hand-built mdast nodes
// (no parser needed). The compile-level tests below reproduce the one
// Docusaurus-specific detail this plugin actually depends on — rehype-raw
// running for `format: 'md'` with `passThrough: ['mdxJsxFlowElement', ...]`
// (see @docusaurus/mdx-loader's processor.js) — using the real
// @mdx-js/mdx + rehype-raw packages already in node_modules (transitive
// deps of @docusaurus/mdx-loader), not a hand-rolled approximation. This
// is what catches a regression back to a plain `html` node, which would
// silently keep working for 'md' but break 'mdx' — exactly the bug this
// plugin shipped with once (see PR #14).
import test from 'node:test';
import assert from 'node:assert/strict';
import {compile, run} from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import rehypeRaw from 'rehype-raw';
import remarkYoutubeEmbed, {matchYoutubeParagraph} from '../src/remark/youtubeEmbed.mjs';

const THUMB = 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
const PATTERN = `[![Title](${THUMB})](https://youtu.be/dQw4w9WgXcQ)\n`;

function paragraph(children) {
  return {type: 'paragraph', children};
}

function link(url, children) {
  return {type: 'link', url, children};
}

function image(url, alt) {
  return {type: 'image', url, alt};
}

test('matchYoutubeParagraph: matches youtu.be links', () => {
  const node = paragraph([link('https://youtu.be/dQw4w9WgXcQ', [image(THUMB, 'Title')])]);
  assert.deepEqual(matchYoutubeParagraph(node), {thumbnailId: 'dQw4w9WgXcQ', title: 'Title'});
});

test('matchYoutubeParagraph: matches youtube.com/watch?v= links', () => {
  const node = paragraph([
    link('https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s', [image(THUMB, 'Title')]),
  ]);
  assert.deepEqual(matchYoutubeParagraph(node), {thumbnailId: 'dQw4w9WgXcQ', title: 'Title'});
});

test('matchYoutubeParagraph: falls back to "Video" with no alt text', () => {
  const node = paragraph([link('https://youtu.be/dQw4w9WgXcQ', [image(THUMB, undefined)])]);
  assert.equal(matchYoutubeParagraph(node).title, 'Video');
});

test('matchYoutubeParagraph: no match when the thumbnail and link ids differ', () => {
  const node = paragraph([link('https://youtu.be/otherId12345', [image(THUMB, 'Title')])]);
  assert.equal(matchYoutubeParagraph(node), undefined);
});

test('matchYoutubeParagraph: no match when the image is not on img.youtube.com', () => {
  const node = paragraph([
    link('https://youtu.be/dQw4w9WgXcQ', [image('https://example.com/dQw4w9WgXcQ.jpg', 'Title')]),
  ]);
  assert.equal(matchYoutubeParagraph(node), undefined);
});

test('matchYoutubeParagraph: no match when the paragraph has more than one child', () => {
  const node = paragraph([link('https://youtu.be/dQw4w9WgXcQ', [image(THUMB, 'Title')]), {type: 'text', value: '!'}]);
  assert.equal(matchYoutubeParagraph(node), undefined);
});

test('matchYoutubeParagraph: no match when the link has text next to the image', () => {
  const node = paragraph([
    link('https://youtu.be/dQw4w9WgXcQ', [image(THUMB, 'Title'), {type: 'text', value: ' watch'}]),
  ]);
  assert.equal(matchYoutubeParagraph(node), undefined);
});

test('matchYoutubeParagraph: no match on a plain paragraph', () => {
  assert.equal(matchYoutubeParagraph(paragraph([{type: 'text', value: 'hello'}])), undefined);
});

async function renderAsFormat(format) {
  const rehypePlugins =
    format === 'md' ? [[rehypeRaw, {passThrough: ['mdxJsxFlowElement', 'mdxJsxTextElement']}]] : [];
  const compiled = await compile(PATTERN, {
    format,
    outputFormat: 'function-body',
    remarkPlugins: [remarkYoutubeEmbed],
    rehypePlugins,
  });
  const {default: Content} = await run(compiled, runtime);
  return renderToStaticMarkup(Content());
}

test('compiles and renders an iframe with format "md" (rehype-raw + passThrough, as Docusaurus configures it)', async () => {
  const html = await renderAsFormat('md');
  assert.match(html, /class="video-wrapper"/);
  assert.match(html, /<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/);
});

test('compiles and renders an iframe with format "mdx" — regression test for PR #14 (used to throw "Cannot handle unknown node `raw`")', async () => {
  const html = await renderAsFormat('mdx');
  assert.match(html, /class="video-wrapper"/);
  assert.match(html, /<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/);
});
