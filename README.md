# conjunctiongame.com

The website for **Conjunction**, a dark fantasy RPG for Android.

Three pages, no framework, no build step: plain HTML and one stylesheet, served by GitHub Pages.

```
index.html            landing page
privacy.html          privacy policy
legal-notice.html     Impressum (§ 5 DDG)
404.html
CNAME                 the custom domain, read by GitHub Pages
.nojekyll             serve the files as they are, do not run Jekyll
assets/css/site.css
assets/img/           web-sized art, produced by the script below
tools/prepare_images.py
```

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

It describes what the app does today — which is nothing: no accounts, no analytics, no advertising,
no network traffic at all. If that ever changes, the policy is updated *before* the release that
changes it, and the version and date at the top of the page say so.

## Licence

The artwork, the Conjunction name and the emblem are not free to reuse. The page markup and
stylesheet are of no interest to anyone else anyway.
