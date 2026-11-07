# Barnebok / Reader compound glossary patch

Replace exactly two files in GitHub main: `admin.html` and `index.html`. No data, worker, sw, vendor or other files changed.

Studio: restore normal OpenType shaping as used by Reader (remove previous kern/liga/calt disabling); CSP hashes regenerated.
Reader: punctuation-tolerant link decoration for hyphenated expressions and apostrophe variants. Requires term to already be present in the published book glossary; does not create or publish missing glossary entries.

Please verify the expression is in published `library-data.json` with matching reference IDs and a complete GitHub Pages deployment. This patch does not resolve a missing or stale published JSON itself.
