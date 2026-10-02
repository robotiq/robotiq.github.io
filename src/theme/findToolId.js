import {VERSIONED_TOOLS} from '../../scripts/versioned-tools';

// Used by src/theme/DocVersionBanner to tell whether a page actually has a
// registered submodule behind it (only those pages ever genuinely differ
// between Latest and Stable) before showing any version-specific UI on
// it — kept as its own module rather than inlined there since a second
// consumer (src/theme/DocVersionBadge) used to need the exact same check
// too, and might again. `docId` is
// relative to the 'software-tools' instance's own root, e.g.
// 'Adaptive grippers/Libraries/C++/index' or
// '.../Libraries/C++/docs/environment-setup'.
export default function findToolId(docId) {
  return Object.keys(VERSIONED_TOOLS).find(
    (toolId) => docId === VERSIONED_TOOLS[toolId].toolPath || docId.startsWith(`${VERSIONED_TOOLS[toolId].toolPath}/`)
  );
}
