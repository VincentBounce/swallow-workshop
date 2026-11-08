# Third-party notices

This repository is licensed under Apache-2.0 (`LICENSE`). Attribution for the lexicon derived from Misaki is in
`NOTICE`.

## Included in this repository

| component | license | where | used for |
|---|---|---|---|
| Misaki by hexgrad: the American English "gold" dictionary `us_gold.json` | Apache-2.0 | https://github.com/hexgrad/misaki | `public/lexicon/en-us.lex`, the pronunciations of the speak panel (changes listed in `NOTICE`) |

## Bundled in the built site

`npm run build` bundles these packages into `dist/`; they are installed by npm, not copied into this
repository.

| component | license | where |
|---|---|---|
| three.js by mrdoob and contributors | MIT | https://github.com/mrdoob/three.js |
| React and React DOM by Meta Platforms, Inc. and affiliates | MIT | https://github.com/facebook/react |

The development tools (Vite, Vitest, TypeScript, tsx and their dependencies) keep their own licenses; see the
installed package metadata.

## Measurements from the literature

`src/dsp/data/mri.ts` holds the vowel area functions published in Story, B. H. (2008), "Comparison of magnetic
resonance imaging-based vocal tract area functions obtained from the same speaker in 1994 and 2002", JASA 123.
Other constants come from the papers listed under References in `README.md`, each cited where it is used.

## Images

`public/anatomy/head.jpg` is a painting generated from the guide image of `scripts/head-guide.ts` and retouched
to match the model (see Architecture in `README.md`). It and the images in `public/img/` are part of
this project and are licensed with it.
