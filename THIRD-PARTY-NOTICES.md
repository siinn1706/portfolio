# Third-party notices

This portfolio includes the selected font, project evidence and contact icons described below. The separate Three.js stage and its dependencies/license output were removed on 2026-09-10 after the user changed the design direction. Historical stage artifacts retain their own notices. The supplied lockfile records the current build/test dependency tree.

## Be Vietnam Pro

Copyright 2021 The Be Vietnam Pro Project Authors.

Project: https://github.com/bettergui/BeVietnamPro

The four unmodified WOFF2 files in `src/assets/fonts/` contain regular 400 and semibold 600 weights, each in Latin and Vietnamese subsets. They are licensed under the **SIL Open Font License, Version 1.1**. The complete supplied copyright and license text is preserved in `src/assets/fonts/LICENSE.txt` and distributed with the site at `public/fonts/OFL.txt`.

The eight selected architecture SVGs also embed Be Vietnam Pro font data. The same font license accompanies those outputs. No fonts were renamed or modified during this integration.

## Project screenshots and diagrams

Four screenshots show the local interfaces of Nguyễn Văn Nam's project repositories, with original UI content retained:

| Project | Repository | Captured source commit |
|---|---|---|
| HealthOS | https://github.com/siinn1706/NT208_HealthOS | `5131987c953d800e1c343cc7156be7554e4e498f` |
| Quản lý kho | https://github.com/siinn1706/NT106_QuanLyKho | `7499d982e49b1b64c5848d568019c33a82467bbc` |

The selected originals are Home and Services for HealthOS, and Dashboard and Items for Quản lý kho. Responsive WebP derivatives only resize and encode the complete image. Full PNGs remain byte-identical to the supplied captures. Captions identify local/sample or empty-demo scope; product text and illustrative figures are not portfolio performance or health claims.

Four architecture concepts, each in Vietnamese and English, were reconstructed from the pinned project source during the portfolio research. SVG originals are preserved; responsive WebP previews are generated from the supplied PNGs. Source references and scope remain in the media registry and case text. Diagram reconstruction does not establish sole authorship or runtime/production validation.

Brand names, embedded interface graphics and other content visible inside screenshots retain their respective rights. This notice does not grant a separate license to extract or redistribute those elements. Public repository availability alone is not a blanket asset license. The portfolio includes only the selected project evidence.

## Contact icons

The Facebook and GitHub SVG paths in `src/components/contact-links.astro` were retrieved on 2026-09-09. Their path geometry is unchanged; the decorative wrappers scale them to a consistent 22px display and inherit the contact's monochrome text color. No icon package or external runtime request is added.

| Icon | Source | License |
|---|---|---|
| GitHub | [Primer Octicons `mark-github-16.svg`](https://raw.githubusercontent.com/primer/octicons/main/icons/mark-github-16.svg) | MIT; Copyright (c) 2026 GitHub Inc. The complete upstream notice is distributed at `public/licenses/primer-octicons-mit.txt`. |
| Facebook | [Simple Icons `facebook.svg`](https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/facebook.svg) | [CC0 1.0 Universal](https://raw.githubusercontent.com/simple-icons/simple-icons/develop/LICENSE.md). This is the maintained library asset, not a direct Meta brand-pack download. |

Brand names and marks retain their respective trademark rights. The code licenses do not grant separate trademark rights. Relevant platform guidance: [GitHub brand toolkit](https://brand.github.com/foundations/logo) and [Facebook brand resources](https://www.meta.com/brand/resources/facebook/logo/).

## Transitions.dev

Referenced on 2026-09-17 as a **design reference** for duration and easing scale names only: https://transitions.dev/skill. Timing values stay owned by this site's `--motion*` tokens. No CSS, JavaScript, `_root.css`, recipe classes, or runtime package was copied or installed from that repository because the GitHub license is unset. This is not a vendored library.

## Direct software dependencies

| Package | Installed version | Declared license | Role |
|---|---|---|---|
| Astro | 7.3.2 | MIT | Static page build |
| es-module-lexer | 2.3.2 | MIT | Build-output import graph verification |
| Sharp | 0.35.4 | Apache-2.0 | Build-time image processing |
| @astrojs/check | 0.9.10 | MIT | Astro/type checks |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | Accessibility test tooling |
| @playwright/test | 1.63.0 | Apache-2.0 | Browser test tooling |
| Cheerio | 1.2.0 | MIT | Build-output checks |
| tsx | 4.23.13 | MIT | TypeScript test execution |
| TypeScript | 6.0.3 | Apache-2.0 | Static checking |
| @types/node | 26.5.0 | MIT | Node API type definitions |

Astro is the direct application dependency. The module lexer is retained as build/test tooling for output graph verification. Content validation imports Zod through `astro/zod`; Zod is supplied through Astro's dependency tree rather than a separate direct version constraint. Package license texts remain in the installed packages and their upstream distributions. Build and test tools are not copied wholesale into the static output. Transitive packages can have different licenses; this direct-package summary is not a completed license audit of the projects shown in screenshots or every dependency.

No reference-site screenshots, commercial stock imagery, AI concept images or research galleries are included. Selected personal portraits appear in the portfolio; their inclusion does not grant a license to reuse them. The published asset inventory is in src/assets/ and its selections are declared in src/data/media.ts, src/data/personal-media.ts and src/data/share-media.json.
