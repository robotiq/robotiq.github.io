// Shared by src/theme/Layout (StickyVersionRedirect) and
// src/theme/NavbarItem/DocsVersionDropdownNavbarItem — both need "which
// page should a visitor land on, in THIS version, given they were just
// looking at docId in another version."
//
// The exact same page is the obvious first choice when it exists there
// too (e.g. an early tag can predate a Doxyfile, so Stable has no API
// reference at all yet even though Latest does) — but falling straight
// to the whole instance's own sitewide root from there (what both call
// sites used to do, via `version.docs.find(doc => doc.id ===
// version.mainDocId)`) is a jarring landing spot when something much
// closer is usually available: docId's own ancestors. Walking up its
// folder hierarchy (e.g. '.../API/groups/foo' -> '.../API/index' ->
// '.../C++/index' -> '.../Libraries/index' -> '.../index') finds the
// nearest one that DOES exist in the target version — typically the
// tool's own page, or at worst the product's — before giving up and
// falling back to the sitewide root.
//
// `docId` is relative to the 'software-tools' instance's own root (see
// findToolId.js for the same convention), e.g.
// 'Adaptive grippers/Libraries/C++/API/groups/connection-and-configuration'.
// `version` is a full GlobalVersion (docs + mainDocId), same shape
// DocVersionBanner's own getVersionMainDoc uses.
export default function findNearestDocInVersion(docId, version) {
  const exact = version.docs.find((doc) => doc.id === docId);
  if (exact) return exact;

  // Index pages are the only kind an ancestor folder can land on, so
  // every candidate below is built as '<ancestor-folder>/index' — strip
  // docId's own trailing '/index' first so the walk starts one level up
  // from it, not re-checking the id we already just missed above.
  const segments = docId.replace(/\/index$/, '').split('/');
  for (let i = segments.length - 1; i >= 1; i -= 1) {
    const candidateId = `${segments.slice(0, i).join('/')}/index`;
    const candidate = version.docs.find((doc) => doc.id === candidateId);
    if (candidate) return candidate;
  }

  return version.docs.find((doc) => doc.id === version.mainDocId);
}
