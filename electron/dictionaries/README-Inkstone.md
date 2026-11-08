# Offline English dictionary

Inkstone distributes only `en-US-10-2.bdic` from the official Chromium dictionary repository. It is an unmodified binary dictionary, not a network service. The application copies it into its own local profile and never downloads dictionaries from external servers at runtime.

`provenance.json` records the pinned source commit, original URLs, byte lengths and SHA-256 hashes. `README_en_US.txt` contains the applicable upstream English/SCOWL, Ispell and WordNet copyright and permission notices. The accompanying upstream `LICENSE` and `README.chromium` describe the broader multi-language repository; Inkstone does not bundle those other languages.

The dictionary source uses permissive notices documented in `README_en_US.txt`. The complete notices are retained unchanged. Users' existing cached dictionaries and custom word list are not overwritten. Actual active and initialized languages are reported by `spellcheckStatus`.
