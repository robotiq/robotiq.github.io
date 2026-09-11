#!/usr/bin/env python3
# Template — copy this into a tool repo (e.g. sdk_cpp/tools/check_doc_snippets.py
# in grippers) and adjust --examples-dir's default if that repo's example
# layout differs. See "Verifying markdown code examples against real source"
# in docs/contribute.mdx for the full adoption steps and how this repo wires
# it into its own build via scripts/check-doc-snippets.js. This file is not
# executed from here — scripts/check-doc-snippets.js always runs the copy
# vendored in the submodule at its pinned commit, not this one.
"""Fail if a markdown code block has drifted from the real source it claims to be.

Doxygen's \\snippet already keeps header doc-comments in sync with real,
compiled code (see EXAMPLE_PATH in ../Doxyfile) -- this script gives plain
markdown docs (outside Doxygen's reach) the same guarantee. A markdown code
fence opts in by adding an HTML-comment marker directly above it:

    <!-- snippet: quick_start.cpp qs-config -->
    ```cpp
    ...
    ```

<file> is resolved relative to --examples-dir (default sdk_cpp/examples).
<tag> must bracket a region there with a Doxygen-style `//! [tag]` marker
pair, exactly as \\snippet requires:

    //! [qs-config]
    Robotiq::ConnectionConfig config;
    ...
    //! [qs-config]

The fenced block's content must then match that region verbatim (each
side's common leading indentation is stripped first, and trailing
whitespace is ignored per line). A markdown code fence with no marker
above it is left alone -- this only checks blocks that opt in.
"""
import argparse
import difflib
import re
import sys
from pathlib import Path

MARKER_RE = re.compile(r"^<!--\s*snippet:\s*(\S+)\s+(\S+)\s*-->\s*$")
FENCE_OPEN_RE = re.compile(r"^```cpp\s*$")
FENCE_CLOSE_RE = re.compile(r"^```\s*$")


def dedent(lines):
    indents = [len(line) - len(line.lstrip(" ")) for line in lines if line.strip()]
    if not indents:
        return [line.rstrip() for line in lines]
    common = min(indents)
    return [line[common:].rstrip() if line.strip() else "" for line in lines]


def extract_markdown_blocks(md_path):
    """Yield (line_no, file, tag, [content lines]) for every marked fence."""
    lines = md_path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        marker = MARKER_RE.match(lines[i])
        if not marker:
            i += 1
            continue
        marker_line = i + 1
        if i + 1 >= len(lines) or not FENCE_OPEN_RE.match(lines[i + 1]):
            sys.exit(f"{md_path}:{marker_line}: snippet marker not immediately followed by a ```cpp fence")
        file_, tag = marker.group(1), marker.group(2)
        body = []
        j = i + 2
        while j < len(lines) and not FENCE_CLOSE_RE.match(lines[j]):
            body.append(lines[j])
            j += 1
        if j >= len(lines):
            sys.exit(f"{md_path}:{marker_line}: fence for [{tag}] is never closed")
        yield marker_line, file_, tag, body
        i = j + 1


def extract_tagged_region(source_path, tag):
    lines = source_path.read_text(encoding="utf-8").splitlines()
    marker = f"[{tag}]"
    hits = [n for n, line in enumerate(lines) if marker in line and line.strip().startswith("//!")]
    if len(hits) != 2:
        sys.exit(f"{source_path}: expected exactly 2 '//! {marker}' markers, found {len(hits)}")
    start, end = hits
    return lines[start + 1 : end]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("markdown_files", nargs="+", type=Path)
    parser.add_argument("--examples-dir", type=Path, default=Path("sdk_cpp/examples"))
    args = parser.parse_args()

    checked = 0
    failed = 0
    for md_path in args.markdown_files:
        for marker_line, file_, tag, doc_lines in extract_markdown_blocks(md_path):
            source_path = args.examples_dir / file_
            if not source_path.is_file():
                sys.exit(f"{md_path}:{marker_line}: no such file {source_path}")
            real_lines = extract_tagged_region(source_path, tag)
            checked += 1

            doc_norm = dedent(doc_lines)
            real_norm = dedent(real_lines)
            if doc_norm != real_norm:
                failed += 1
                print(f"MISMATCH {md_path}:{marker_line} [{file_} {tag}] has drifted from {source_path}:")
                diff = difflib.unified_diff(real_norm, doc_norm, fromfile=str(source_path), tofile=str(md_path), lineterm="")
                print("\n".join(diff))
                print()

    print(f"checked {checked} snippet(s), {failed} mismatch(es)")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
