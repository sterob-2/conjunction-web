# conjunctiongame.com

The website for **Conjunction**, a dark fantasy RPG for Android.

No framework, no build step: plain HTML, one stylesheet and two small script modules, served by GitHub Pages.

```
index.html            landing page
sign-in.html          sign-in with the Google account linked in the game; shows the player's arena names
privacy.html          privacy policy
legal-notice.html     Impressum (§ 5 DDG)
delete-account.html   how to delete the cloud account (Google Play's account deletion link)
404.html
CNAME                 the custom domain, read by GitHub Pages
.nojekyll             serve the files as they are, do not run Jekyll
assets/css/site.css
assets/js/web-session.js    the sign-in against Unity Gaming Services, without the DOM
assets/js/sign-in-page.js   the sign-in page's buttons and lines
assets/img/           web-sized art, produced by the script below
assets/img/shots/     the screenshots of the latest Closed build, written by the game repo
tests/                node --test, for the script modules
tools/prepare_images.py
```

## Signing in

`sign-in.html` loads Google's sign-in, sends Google's ID token to Unity Authentication with `signInOnly`, so a Google
account the game never linked makes no player, and swaps the first session at once for a child session that only
Cloud Save and Cloud Code accept and that ends seven days after the sign-in. The child is kept in `sessionStorage`;
Sign out drops it. What Unity accepts from this origin was measured on 2026-11-24 (the game repo's
`docs/evidence/task-1506/`). Two settings outside this repo carry it: the Google web client in `web-session.js`
lists `https://conjunctiongame.com` among its authorised JavaScript origins, and Unity's Google provider names the
same client.

The tests need Node 22 or later and nothing else:

```powershell
node --test
```

## The screenshots come with each Closed build

The galleries (`<div class="shots" data-store-shots="1-3">` and `"4-6"` in `index.html`) are not edited by
hand. When a build is promoted to the Closed track, the game repo's `tools/play/publish_internal.py --promote`
writes the build's store set into `assets/img/shots/` with a `manifest.json` naming the build, rewrites the
galleries from it and removes every picture the set no longer has (`tools/play/store_shots.py` in the game repo,
TASK-1517). Commit and push what it wrote.

## The images are generated, not hand-cut

The source artwork lives in the game project and is far too heavy for the web — the key art alone is
a 3.8 MB PNG. `tools/prepare_images.py` reads the originals and writes web sizes into `assets/img/`,
turning some 11 MB of source art into about 0.8 MB. Run it after the artwork changes and commit what
it produced:

```powershell
python tools/prepare_images.py
```

It expects the game project next door; point `CONJUNCTION_REPO` at it if it lives elsewhere.

`og-image.jpg` is deliberately a JPEG rather than WebP: several link scrapers still refuse WebP and
would show no preview at all when the link is shared.

## Deploying

Push to `main`. Pages publishes within a minute or two.

## DNS

The domain is registered elsewhere and only *points* here, which means the website records and the
mail records live side by side in the same zone:

> **Never delete the MX records.** They carry the mail for this domain. Changing the A and AAAA
> records moves the website; deleting the MX records stops mail arriving, silently and without a
> bounce. Touch only the record types below.

| Type | Host | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `sterob-2.github.io` |

Delete any A record the registrar pre-set for domain parking or forwarding first — otherwise old and
new records answer in turn and the site loads only sometimes, which is a maddening thing to debug.

Afterwards: **Settings → Pages → Custom domain** → `conjunctiongame.com` → Save, wait for the DNS
check to go green, then tick **Enforce HTTPS**. GitHub issues the certificate itself; there is
nothing to buy or install.

## A note on the privacy policy

It describes what the app and this website do today. Whatever changes what they send or keep updates the
policy *before* the release that changes it, and the version and date at the top of the page say so.

## Licence

The artwork, the Conjunction name and the emblem are not free to reuse. The page markup and
stylesheet are of no interest to anyone else anyway.
