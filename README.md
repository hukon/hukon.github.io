# Nidhal Abderrahmane Dilmi, portfolio

A small static portfolio site: a one-page overview with an interactive map of my projects, plus a printable CV page and its PDF. It is plain HTML, CSS and a little JavaScript, with no build step.

Live site: https://hukon.github.io

## Structure

- `index.html`: the portfolio page.
- `cv/`: the CV as a web page (`index.html`) and as a PDF (`Nidhal-Dilmi-CV.pdf`).
- `assets/css/`: stylesheets for the portfolio and the CV.
- `assets/js/`: the script that draws the project map.
- `assets/fonts/`: self-hosted font files.
- `assets/img/`: project images and the share image.
- `scripts/`: helper script to rebuild the CV PDF.
- `tests/`: automated checks for the site.
- `favicon.svg` and `apple-touch-icon.png`: the browser-tab icon and its 180 by 180 home-screen version.
- `.nojekyll`: tells GitHub Pages to serve the files as they are.

## Checks

```sh
npm install
npm test
```

The tests check, among other things, that every local link and file reference resolves and that nothing is loaded from another host.

## Rebuild the CV PDF

After changing `cv/index.html` or `assets/css/cv.css`, regenerate the PDF with headless Chrome:

```sh
bash scripts/build-cv-pdf.sh
```

## Re-shoot the share image

When the hero changes, re-take `assets/img/og.png` (1200 by 630) with headless Chrome so the animated map is captured still:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
  --force-prefers-reduced-motion --window-size=1200,630 --screenshot=assets/img/og.png "file://$PWD/index.html"
```

## Self-hosted assets

Fonts, images and scripts are all served from this repository, with no calls to external services. This keeps the site working in mainland China, where many third-party hosts are blocked.

## Licence of the fonts

Manrope and JetBrains Mono are used under the SIL Open Font License 1.1, installed through [Fontsource](https://fontsource.org).
