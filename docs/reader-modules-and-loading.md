# Reader modules and lazy loading — first implementation

Source baseline: `b35a40dba21ea7fadc4f9485e520da0640e1e908`. The canonical JSON, Studio, Worker and secrets are unchanged.

## Source architecture

The catalog is now separate from `reader/`. See `reader/README.md` for the source contracts. Reader JavaScript/styles keep their original order and scopes; the build assembles them into a lazy template. Fonts and SVGs extracted from data URLs are byte-identical. This establishes maintainable source boundaries without simultaneously rewriting gesture/pagination state transitions.

Book content enters the iframe through a safely serialized JSON payload. No function-body or object-boundary string rewriting is needed when opening a book. The catalog data store validates generated paths, coalesces loads, caches the common dictionary and uses generation tokens to isolate cancelled opens or dataset changes. Catalog source files build into one content-addressed script; data loading starts after dependencies initialize. Delayed script loading is exercised in the browser test.

## Build output and measured sizes

All figures below are uncompressed file bodies, not network timings or total page transfer.

| Resource | Before | After |
| --- | ---: | ---: |
| Catalog HTML | 1,910,188 B | approximately 26 KB |
| Initial catalog data | full 6,359,281 B JSON | 4,183 B metadata catalog |
| Reader template | embedded in initial HTML | 322,170 B, fetched on first open |
| Reading fonts | embedded data URLs | separate content-addressed font files |

The initial view also fetches catalog code, branding/font and visible covers. Browser tests verify it requests no book text, shared glossary, Reader template or reading fonts before opening a book. Per-book files retain all original chapter IDs/text/rich HTML and editorial metadata. The shared dictionary retains every term/definition/etymology and is not filtered by provenance.

`library-data.json` remains the source of truth. `npm run build` derives catalog, book files, glossary and cover images under `dist/public-data/`. Changed content produces changed URLs; unchanged books keep their URLs. The runtime does not fetch the canonical full JSON during normal catalog startup.

## Offline behavior

An opened book warms its Reader/font dependencies. The explicit library download prepares all books, the common dictionary and all Reader assets. The catalog remains light on first visit. Readiness is reported only after the requested cache writes complete; interrupted downloads can be retried. Studio HTML stays network-only.

Users should complete offline download before disconnecting and repeat it after library updates. Storage eviction/private browsing remain browser limitations. The dedicated browser test uses both browser offline mode and server-side network failure, so a service worker cannot accidentally satisfy the test by reaching the still-online local server.

## Production integration — required at approval

The source `index.html` contains a build-time runtime configuration placeholder. **Deploy `dist/`, not repository root.** Before merging this PR, switch repository Pages source from `legacy`/branch to `workflow`/GitHub Actions as part of the user-approved publication. Do not change production settings during PR preparation.

The updated workflow builds every `main` push, including Studio data-only commits; verifies core tests and all three engines; uploads `dist/` and deploys that single artifact. Concurrency prevents an older run from publishing after a newer one. The previously deployed site stays live until the new artifact succeeds. No derived files need a follow-up commit and no stale catalog is committed beside a newly edited JSON.

Rollback must likewise coordinate source and hosting mode: reverting to the prior root-based application also requires restoring the previous branch-based Pages configuration, or deploying a matching prior artifact.

## Validation

- Existing invariant tests inspect the assembled source via a test-only helper. Their content/Unicode/pagination/gesture checks remain in force.
- All browser tests serve the real `dist/` artifact. Timing/fault-injection tests block service workers; actual offline behavior has a separate test.
- New build tests verify metadata-only catalog, lossless books/IDs/images/dictionary, content hashes and data-only regeneration.
- New browser test serves a GitHub Pages-style subpath; checks lazy requests, opened-book offline reflow dependencies, complete download, uncached-book failure, cancellation, retry and correct book isolation.
- Existing compatibility, progressive pagination, 130% fill, memory, mobile, glossary and Studio tests remain required.
