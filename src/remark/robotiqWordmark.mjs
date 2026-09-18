// Renders `Robotiq` (an inline code span reading exactly that, opted into
// per-page by whoever writes the markdown) in a font treatment that echoes
// the Robotiq logo's wordmark — bold, uppercase, brand blue — instead of
// plain text or an actual logo image. Stays real text (not a picture): a
// screen reader, copy-paste, or browser search still just sees "Robotiq".
// See ".robotiq-wordmark" in src/css/custom.css for the styling.
//
// Deliberately narrow: only a code span whose value is the single word
// "Robotiq" is replaced — everything else (prose, headings, `robotiq-cli`,
// `Robotiq's`, code blocks, URLs) is left untouched. See
// docs/contribute/how-it-works.mdx for why this is opt-in rather than a
// blanket find-and-replace over rendered text.
import {visit} from 'unist-util-visit';

export default function remarkRobotiqWordmark() {
  return (tree) => {
    visit(tree, 'inlineCode', (node, index, parent) => {
      if (node.value !== 'Robotiq' || !parent || index === null) return;
      parent.children[index] = {
        type: 'mdxJsxTextElement',
        name: 'span',
        attributes: [
          {type: 'mdxJsxAttribute', name: 'className', value: 'robotiq-wordmark'},
        ],
        children: [{type: 'text', value: 'Robotiq'}],
      };
    });
  };
}
