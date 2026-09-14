// Declares which files/folders sync-external-docs.js copies from which
// submodule, and which repoUrl/branch preview-external-docs.js fetches from
// when previewing WIP content ahead of a merge. Add new repos here.

// Merges the shared submodule/repoUrl/branch fields into each job, so a
// submodule with several jobs (README, docs/, generated API reference, ...)
// states them once instead of repeating them on every entry.
function submoduleJobs(submodule, { repoUrl, branch }, jobs) {
  return jobs.map((job) => ({ submodule, repoUrl, branch, ...job }));
}

const JOBS = [
  ...submoduleJobs('2f85_cpp', { repoUrl: 'https://github.com/robotiq/grippers', branch: 'main' }, [
    // 2F 85 CPP driver README
    { from: 'README.md', to: 'drivers/2F hande/SDK/C++/_readme.md' },

    // 2F 85 CPP driver docs/ folder. No sidebarPositions needed: the repo
    // itself now names these guides with a numeric prefix (1-introduction.md,
    // 2-how-it-works.md, ...), which already sorts correctly alphabetically
    // (see scripts/folder-sidebar.mjs's fallback) — no local reading-order
    // map to keep in sync with upstream renames.
    //
    // docSnippetsCheck: some of these guides mark a code fence with
    // `<!-- snippet: file tag -->`, claiming it's an exact copy of a
    // `//! [tag]`-bracketed region in a real, compiled example file — see
    // "Verifying markdown code examples against real source" in
    // contribute/api-reference-cpp.mdx. This repo already vendors the
    // verifier at sdk_cpp/tools/check_doc_snippets.py (paths below are
    // relative to the submodule root); scripts/check-doc-snippets.js runs it
    // as part of `npm run generate`, so a stale example fails the build here
    // too, not just in grippers' own CI.
    {
      from: 'docs',
      to: 'drivers/2F hande/SDK/C++/docs',
      docSnippetsCheck: {
        script: 'sdk_cpp/tools/check_doc_snippets.py',
        markdownGlob: 'docs/*.md',
        examplesDir: 'sdk_cpp/examples',
      },
    },

    // 2F 85 CPP driver generated API reference — built by doxygen2docusaurus
    // (see sync-external-docs.js's handling of `doxygen2docusaurus` jobs)
    // straight from the Doxygen XML in sdk_cpp/doxygen-xml. Its own
    // sidebar-category-doxygen.json already nests "Topics" (the
    // \defgroup/\ingroup hierarchy: Core API > Commands & Status /
    // Connection & Configuration / Register Map & Masks / Runtime &
    // Extension Points / Utilities, plus Testing & CI Utilities) and
    // "Classes" (a full hierarchy + alphabetical/kind indices) — no manual
    // sidebars.js upkeep needed as groups/classes are added, renamed, or
    // removed upstream. Every group's content — including the register-map
    // constants, direct group members via \addtogroup register_map
    // upstream — lives on its own groups/ page, so no per-page job is
    // needed beyond this one.
    //
    // `exclude` (paths relative to the generated API root, same matching
    // rules as a folder job's `exclude`) drops: `files`/`folders` and their
    // `indices/files` index — a per-header dump that duplicates
    // classes/groups with no added value (also sidesteps a real
    // doxygen2docusaurus v2.2.2 bug: it builds a file/folder's nested slug
    // by walking parent directory compound names, but a Doxygen `dir`
    // compound's own name is *already* the full path from the Doxygen root,
    // not just its own leaf segment, so each ancestor's full path gets
    // concatenated in again at every level — e.g.
    // `files/include-include-robotiq-include-robotiq-gripper-command-hpp.md`
    // for `include/Robotiq/gripper/command.hpp`. Excluding files/folders
    // entirely (matching this site's existing scope, which never showed a
    // Files section) means the shipped site never surfaces this); `namespaces`
    // and its `indices/namespaces` index — noise (std, an internal detail
    // namespace, and a top-level Robotiq namespace page) now that nothing
    // depends on it now that namespace-owned direct group members already
    // render on their group's own page. See scripts/sync-external-docs.js's
    // pruneDoxygenSidebar for the matching sidebar-JSON prune.
    //
    // The generated top-level `index.md` (the Topics overview, titled from
    // the submodule's own Doxyfile PROJECT_NAME) is deliberately NOT
    // excluded — it's this section's landing page. Every page under this
    // job must come from the submodule alone; this site only renders it,
    // never hand-authors or curates content on top.
    {
      doxygen2docusaurus: { doxyfileDir: 'sdk_cpp' },
      to: 'drivers/2F hande/SDK/C++/API',
      exclude: [
        'files', 'folders', 'indices/files',
        'namespaces', 'indices/namespaces',
        // The "Classes" category's own landing page (indices/classes/index,
        // a tree of every class/struct) is now redundant with the Global
        // Index — but it's NOT excluded here: sync-external-docs.js's
        // class-into-groups merge reads every class doc nested under this
        // same category (Classes > Hierarchy > ...) before dropping it, and
        // pruneDoxygenSidebarNode (which this exclude list feeds) would
        // delete that whole subtree — including the still-needed class
        // leaves — the moment this category's own link matched an exclude
        // entry, before the merge ever got to run. See the dedicated
        // "Classes" category removal in sync-external-docs.js instead,
        // which runs after that merge completes.
        'indices/classes/all.md',
        'indices/classes/classes.md',
        'indices/classes/functions.md',
        'indices/classes/variables.md',
        'indices/classes/typedefs.md',
        'indices/classes/enums.md',
        'indices/classes/enumvalues.md',
      ],
    },
  ]),

  ...submoduleJobs('tactile_sensors', { repoUrl: 'https://github.com/robotiq/tactile_sensors', branch: 'main' }, [
    // TSF 85 CPP driver README
    { from: 'sdk_cpp/README.md', to: 'drivers/TSF-85/SDK/C++/_readme.md' },
    // TSF 85 Python driver README
    { from: 'sensor_quickstart/README.md', to: 'drivers/TSF-85/SDK/Python/_readme.md' },
    // Folder example — uncomment when a repo has a docs/ folder:
    // { from: 'docs', to: 'drivers/tsf-85' },
  ]),
];

module.exports = JOBS;
