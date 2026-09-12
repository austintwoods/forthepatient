# Self-hosted webfonts (BRAND-1, ⧖D178) — entries for the ⧖#41 license inventory (§17.21)

Both families are licensed under the SIL Open Font License 1.1 (OFL.txt copies alongside). They are ASSETS, not runtime dependencies: no CDN origin, no build step. Font Awesome (cdnjs, 6.4.0) is removed and leaves the inventory.

| Family | Files (woff2, converted with fontTools 4.x from the upstream TTF) | Upstream (google/fonts, `main`) | Commit at fetch | Upstream sha256 (TTF, first 16) |
|---|---|---|---|---|
| Bricolage Grotesque (variable: opsz 12–96, wght 200–800, wdth 75–100) | `BricolageGrotesque-Variable.woff2` (205,188 B) | `ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf` | `6ce172f74aa355ea43eb964fa4a91570a4d3064d` | `413e7357809ddd12` |
| Atkinson Hyperlegible Regular | `AtkinsonHyperlegible-Regular.woff2` (23,232 B) | `ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf` | `95f4904fc8bcf26d3420fe315560c96417c6dec7` | `7fb917c89019896d` |
| Atkinson Hyperlegible Bold | `AtkinsonHyperlegible-Bold.woff2` (23,816 B) | `ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Bold.ttf` | `95f4904fc8bcf26d3420fe315560c96417c6dec7` | `5a3b0c8cc8ca5451` |

Copyright: Bricolage Grotesque © Mathieu Triay (OFL); Atkinson Hyperlegible © 2020 Braille Institute of America, Inc. (OFL). Reserved Font Names apply per OFL §1 — the files are served under their own names and are not renamed or modified beyond container conversion.

Deploy: serve `/fonts/*.woff2` with long-cache headers; CSP `font-src 'self'` (SEC-PENTEST-1).
