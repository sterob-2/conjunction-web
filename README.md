# conjunctiongame.com

The public website for **Conjunction**, the Android RPG built in the (private) `conjunction` repo.
Three pages, no build step, no framework: plain HTML and one stylesheet, served by GitHub Pages.

It exists for one hard reason. Google Play refuses any release beyond the internal track until a
**privacy policy URL** is reachable — see `docs/engineering/play-store-listing.md` §3 in the game
repo. `/privacy.html` is that URL.

## Why this repo is separate and public

The game repo is private, and GitHub Pages only serves from public repos on the free plan. Rather
than pay for Pro or open the game sources, the website lives here on its own. Nothing in this repo
reveals anything about the game that is not already on the store page.

## Layout

```
index.html            landing page
privacy.html          privacy policy  <- the URL Play points at
legal-notice.html     Impressum (§ 5 DDG)
CNAME                 the custom domain, read by GitHub Pages
.nojekyll             serve the files as they are, do not run Jekyll
assets/css/site.css   palette lifted from DarkFantasyColors.cs
assets/img/           web-sized art, produced by the script below
tools/prepare_images.py
```

### The images are generated, not hand-cut

The source art lives in the game repo and is far too heavy for the web — the key art alone is a
3.8 MB PNG. `tools/prepare_images.py` reads from `D:/repos/conjunction-b` and writes the web sizes
into `assets/img/` (11 MB of source becomes about 0.8 MB of WebP). After the art changes, run it and
commit what it produced:

```powershell
python tools/prepare_images.py
```

`og-image.jpg` is deliberately a JPEG rather than WebP: several link scrapers still refuse WebP and
would show no preview at all when the link is shared in Discord or WhatsApp.

## DNS at IONOS

The domain is registered with IONOS under a **Mail Basic** contract, which includes mailboxes but
**no webspace** — hence GitHub Pages for the pages and IONOS for the mail. That split is the one
thing to keep in mind when editing DNS:

> **Never delete the MX records.** They carry `hello@conjunctiongame.com`. Changing the A records
> points the website elsewhere; deleting the MX records silently kills the mailbox. Touch only the
> record types listed below.

In the IONOS panel: **Domains & SSL → conjunctiongame.com → DNS**.

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

Delete any A record IONOS pre-set for domain parking or forwarding first — otherwise the old and new
records answer in turn and the site loads only sometimes, which is a maddening thing to debug.

The second domain, `conjunction-game.com`, is not pointed here. Set it up in IONOS as a plain
**domain forwarding** to `https://conjunctiongame.com` so typos still land.

### After the records are in

1. Repo → **Settings → Pages → Custom domain** → `conjunctiongame.com` → Save.
2. Wait for the DNS check to go green (minutes to a few hours; IONOS is usually quick).
3. Tick **Enforce HTTPS**. GitHub issues the Let's Encrypt certificate itself; there is nothing to
   buy or install at IONOS.

## Deploying

Push to `main`. Pages publishes within a minute or two. There is no pipeline and nothing to build.

## Before the site goes live

- [ ] Fill in the address in `legal-notice.html` and delete the red `todo` block.
- [ ] Fill in the same address under *Who is responsible* in `privacy.html`.
- [ ] Create the `hello@conjunctiongame.com` mailbox in IONOS (Mail Basic includes it) — the address
      is already printed on all three pages and in the Play listing.
- [ ] Replace the disabled *Closed test · soon* button on `index.html` with the real opt-in URL once
      the closed track is open.

## When advertising, analytics or a leaderboard are added

`privacy.html` carries a prepared, commented-out block for each of the three at the bottom of the
file. They are commented out because **a privacy policy must describe what the app does today**.

Google scans the SDKs in the uploaded bundle against the Data safety declaration in the Play
Console. A policy that promises less than the app actually does is a policy violation and gets the
app suspended. So each feature moves in one round, all four steps or none:

1. Paste the matching block into `privacy.html`, above *Your rights*, and fill in the placeholders.
2. Bump the version number and date at the top of `privacy.html`.
3. Update the **Data safety** form in the Play Console.
4. *Then* roll out the build containing the SDK.

Two traps worth knowing before that day:

- **Advertising in the EU/UK/CH requires a Google-certified CMP** (the consent dialog). Without one,
  Google stops serving ads to those users. The `AD_ID` permission has to be declared for Android 13+,
  and the content rating and target-audience answers have to be revisited.
- **A leaderboard makes us the controller** of data that leaves the device: server location, a data
  processing agreement with the backend provider, and erasure under Art. 17 GDPR that actually
  works. Google Play Games Services keeps Google in the processor role and is much the lighter path.
