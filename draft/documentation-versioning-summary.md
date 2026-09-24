# Documentation versioning — the plan

*Short version. Full reasoning and alternatives: `documentation-versioning.md`.*

## The problem

This site always shows the latest (`main`) state of each submodule. A
customer on an older tagged release can't tell the docs have moved on, and
has no way to see docs matching what they actually have.

## The plan: a 3-way version switcher, only where it matters

A dropdown with three entries, shown **only on pages that come from a
Robotiq-maintained submodule** (a tool's own page, its API reference, its
synced guides):

| Entry | What it shows |
|---|---|
| **Latest** | Today's behavior — every submodule at `main`. May include unreleased changes. |
| **Stable** | Every submodule at its own newest tag. A real, released state. |
| **Previous versions** | Not real docs — one static page: "for an older release, check that product's own tags," with a link per submodule. |

**Not shown on:** product/ROS/Simulation/Other landing pages (they mix
several tools), third-party tool pages (pyRobotiqGripper, community ROS
packages, PyBullet, MuJoCo, GraspGen, ...), or `docs/contribute/`. None of
those are backed by a submodule we tag-track, so there's nothing to
version.

## Why this and not full per-tag versioning

- **Bounded:** always at most 2 real builds (Latest, Stable) per tool,
  never one per tag. Adding submodules or tags never multiplies the work.
- **"Previous versions" costs nothing:** it's one static page, not a
  rebuild — we don't host every old release, we just point at it.
- Covers the real, common case (matching a *released* version) without
  building infrastructure for the rare one (matching an *old* release
  exactly).

## What's new to build

1. A way to track each submodule's *newest tag*, separately from the
   existing `main`-tracking (Dependabot only does branches, not tags).
2. A small, versioned Docusaurus docs instance per Robotiq-maintained
   tool — this is also what scopes the dropdown to only those pages, for
   free.
3. One hand-authored signpost page for "Previous versions," listing each
   submodule with a link to its tags/releases.
4. A small "which version am I looking at" stamp on Latest and Stable
   pages.

## Open before building

- How exactly do we track "latest tag" per submodule (new script, mirrors
  `check-submodule-pins.js`)?
- Do all submodules tag consistently enough (`vX.Y.Z`) to sort on?
- New-tool checklist (`adding-a-tool.mdx`) needs a step for the new
  per-tool versioned instance.
