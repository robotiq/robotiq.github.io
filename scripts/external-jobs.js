// Declares which files/folders sync-external-docs.js copies from which
// submodule, and which repoUrl/branch preview-external-docs.js fetches from
// when previewing WIP content ahead of a merge. Add new repos here.

// Merges the shared submodule/repoUrl/branch fields into each job, so a
// submodule with several jobs (README, docs/, generated API reference, ...)
// states them once instead of repeating them on every entry.
function submoduleJobs(submodule, { repoUrl, branch }, jobs) {
  return jobs.map((job) => ({ submodule, repoUrl, branch, ...job }));
}

// Marks one or more jobs as belonging to a single versioned tool — the
// ONE place `toolId`/`toolPath` get stated, instead of a second
// hand-written entry in scripts/versioned-tools.js. That file (and
// sidebars.software-tools.js's activeItems map) now both derive
// everything they need by scanning JOBS for this field: `submodule`/
// `repoUrl` come along for free from the enclosing submoduleJobs() call,
// and whether this tool needs a guides/API-reference category in the
// sidebar (vs. a plain one-page link) is read off which KINDS of jobs
// exist here (a `to: '<toolPath>/docs'` job, a `doxygen2docusaurus` job)
// — see versioned-tools.js and sidebars.software-tools.js's own
// activeItemFor. See "Checklist: adding versioning to a new tool" in
// docs/website/versioning.mdx for the one remaining manual step this
// doesn't cover (the tool's own position/label in
// scripts/site-nav-tree.mjs's SITE_TREE — inherently not derivable, since
// nothing else on this site says where in the nav a tool belongs or what
// it's called there).
function versionedTool(toolId, toolPath, jobs) {
  return jobs.map((job) => ({ toolId, toolPath, ...job }));
}

const JOBS = [
  ...submoduleJobs('2f85_cpp', { repoUrl: 'https://github.com/robotiq/grippers', branch: 'main' }, [
    // Every job below is versioned, participating in the shared
    // 'software-tools' Docusaurus instance's Stable/Development (main)
    // cuts (see docs/website/versioning.mdx) — destRoot per the
    // comment on it in sync-external-docs.js's job loop, so `to` here is
    // relative to software-tools/ instead of docs/.
    ...versionedTool('adaptive-grippers-cpp', 'Adaptive grippers/Libraries/C++', [

    // 2F 85 CPP driver README
    { from: 'README.md', to: 'Adaptive grippers/Libraries/C++/_readme.md', destRoot: 'software-tools' },

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
    // docs/website/api-reference-cpp.mdx. This repo already vendors the
    // verifier at sdk_cpp/tools/check_doc_snippets.py (paths below are
    // relative to the submodule root); scripts/check-doc-snippets.js runs it
    // as part of `npm run generate`, so a stale example fails the build here
    // too, not just in grippers' own CI.
    {
      from: 'docs',
      to: 'Adaptive grippers/Libraries/C++/docs',
      destRoot: 'software-tools',
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
      to: 'Adaptive grippers/Libraries/C++/API',
      destRoot: 'software-tools',
      // The *shared* 'software-tools' instance's own routeBasePath — not
      // this tool's own sub-path — because Docusaurus inserts a version's
      // path segment (e.g. 'next') right after the owning instance's
      // routeBasePath, before any doc id. See the big comment on
      // apiFolderPath/currentDocsRoot/currentRoutePrefix above
      // DOXYGEN2DOCUSAURUS_STAGING_DIR in sync-external-docs.js for why a
      // destRoot doxygen2docusaurus job needs this explicitly (its own
      // absolute-slug generation can't derive it from destRoot alone).
      routeBasePath: '/docs/drivers',
      // Must match the shared instance's own `versions.current.path` in
      // docusaurus.config.js exactly — this job always writes the
      // *current* version's content, and Development (main) lives under
      // '/next' now that Stable owns the instance root. See the comment on
      // this field in sync-external-docs.js.
      currentVersionPath: 'next',
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
  ]),

  ...submoduleJobs('tactile_sensors', { repoUrl: 'https://github.com/robotiq/tactile_sensors', branch: 'main' }, [
    // TSF 85 CPP and Python driver READMEs — both versioned, participating
    // in the shared 'software-tools' instance's Stable/Development (main)
    // cuts (see docs/website/versioning.mdx), so both live outside
    // docs/ in their own destRoot: nesting the versioned instance's files
    // inside the main docs/ tree (even excluded from it) breaks MDX
    // compilation — see the comment on destRoot in
    // sync-external-docs.js's job loop.
    ...versionedTool('tactile-cpp', 'Tactile Sensor/Libraries/C++', [
      { from: 'sdk_cpp/README.md', to: 'Tactile Sensor/Libraries/C++/_readme.md', destRoot: 'software-tools' },
      // Folder example — uncomment when a repo has a docs/ folder:
      // { from: 'docs', to: 'Tactile Sensor/Libraries/C++/docs', destRoot: 'software-tools' },
    ]),
    ...versionedTool('tactile-python', 'Tactile Sensor/Libraries/Python', [
      { from: 'sensor_quickstart/README.md', to: 'Tactile Sensor/Libraries/Python/_readme.md', destRoot: 'software-tools' },
    ]),
  ]),

  ...submoduleJobs('robotiq_ros', { repoUrl: 'https://github.com/robotiq/ros', branch: 'main' }, [
    // One monorepo, one root README (no per-package README) covering both
    // packages it ships: grippers/ (Adaptive grippers) and robotiq_tsf/
    // (Tactile Sensor) — synced to both products' ROS page. Both
    // versioned, participating in the shared 'software-tools' instance's
    // Stable/Development (main) cuts (see docs/website/versioning.mdx).
    ...versionedTool('adaptive-grippers-ros', 'Adaptive grippers/ROS', [
      { from: 'README.md', to: 'Adaptive grippers/ROS/_readme.md', destRoot: 'software-tools' },
    ]),
    ...versionedTool('tactile-ros', 'Tactile Sensor/ROS', [
      { from: 'README.md', to: 'Tactile Sensor/ROS/_readme.md', destRoot: 'software-tools' },
    ]),
  ]),

  ...submoduleJobs('isaacsim_assets', { repoUrl: 'https://github.com/robotiq/isaacsim_assets', branch: 'main' }, [
    // Robotiq's own 2F gripper Isaac Sim assets/guide — no README, just this
    // one guide file (no separate docs/ split yet: nothing else to put there).
    // Under the shared software-tools instance (see
    // docs/website/versioning.mdx) like every other Robotiq-
    // maintained, submodule-synced tool — destRoot per the comment on it in
    // sync-external-docs.js. isaacsim_assets has no tags yet, so
    // scripts/cut-version.js's Stable cut just carries its live main
    // content forward unchanged for this tool — becomes cut for real
    // automatically once it gets its first tag, no restructuring needed
    // then.
    ...versionedTool('isaac-sim', 'Adaptive grippers/Simulation/Isaac Sim', [
      { from: 'grippers/GRIPPER_SIMULATION_GUIDE.md', to: 'Adaptive grippers/Simulation/Isaac Sim/_readme.md', destRoot: 'software-tools' },
    ]),
  ]),
];

module.exports = JOBS;
