# Reader source boundaries

`template.html` owns markup, asset order and style cascade. `data-source` / `data-sources` are build directives expanded by `scripts/reader-source.mjs`. They are not runtime fetches. Runtime uses a lazy, content-addressed template, assembled from these reviewed source files.

- `scripts/book-bootstrap.js`: reads the safely serialized JSON book payload. Contracts: stable book/chapter IDs, editorial settings, initial source anchor, complete library glossary.
- `scripts/core/dictionary.js`: lookup keys and initial chapter construction.
- `scripts/core/text-search.js`: book-text search.
- `scripts/core/bookmarks.js`: existing bookmark migration and resolution.
- `scripts/core/reading-interactions.js`: existing reading controls and gestures.
- `scripts/core/pagination-layout.js`: typography, Hyphenopoly, measuring and legacy fallback.
- `scripts/core/progressive-pagination.js`: verified batches, cancellation, source mapping and scheduling.
- `scripts/openpageflip-adapter.js`: display engine lifetime, bounded page window, animation/gesture protection.
- Other named scripts: position bridge, mobile/desktop controls, chapter/progress navigation, glossary gestures, viewport, clean copying.
- `styles/`: original stylesheet boundaries, identifiers and cascade order.
- `media/`: byte-identical fonts and SVGs extracted from the previous inline data URLs. Filenames are content hashes; existing font licensing applies.

The six `core` files build into one classic script: this deliberately preserves declaration hoisting and lexical globals while exposing practical source boundaries. Other scripts retain their previous scopes/order. This phase does not replace the paginator, unify its state machine, or convert historical wrappers to ES modules. Those semantic changes can be reviewed independently against the existing invariant/browser tests.

`catalog/reader-session.js` owns lazy loading, open/cancel tokens, iframe lifetime and saved position messages. `catalog/library.js` owns metadata rendering, validated data URLs, book/glossary caches and safe payload construction. `catalog/offline.js` owns explicit offline preparation. The four catalog source files build into one content-addressed classic script, avoiding serial script requests while retaining source boundaries. In-flight requests cannot reopen a closed book or overwrite a newly imported dataset.
