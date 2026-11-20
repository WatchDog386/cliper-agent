# Running behind Cloudflare

Cloudflare in front of your server makes the app load faster worldwide (its edge caches the web app's
scripts, fonts and images), hides the server's address and absorbs attacks. The stack is already set up
for it: every script and asset has a content hash in its name and is served with
`Cache-Control: public, max-age=31536000, immutable`, so Cloudflare caches it at the edge, while the HTML
shell (`no-cache`) and the API (JSON and media links, which Cloudflare does not cache by default) always
come from your server.

## Steps

1. **Add your domain to Cloudflare** and point an `A` record (e.g. `clips.example.com`) at the server, with
   the **orange cloud (Proxied)** on.
2. **SSL/TLS → Overview → Full (strict).** Caddy still gets its own Let's Encrypt certificate
   (`SITE_ADDRESS=clips.example.com` in `deploy/.env`), so the link from Cloudflare to the server stays encrypted.
3. **Tell the API there are two proxies** (Cloudflare → Caddy) so rate limiting sees each visitor's real
   address. In `deploy/.env`:
   ```bash
   TRUST_PROXY=2
   ```
   Then `bash deploy/deploy.sh`.
4. **Speed → Optimization:** turn on **Brotli** and **Early Hints**. Leave *Rocket Loader* **off** (it
   rewrites script loading and breaks single-page apps).
5. **Caching → Configuration:** "Standard" caching level is right. No page rules are needed: the
   `Cache-Control` headers above decide what is cached.
6. **Firewall (recommended):** allow ports 80/443 on the server only from
   [Cloudflare's IP ranges](https://www.cloudflare.com/ips/), so nobody can bypass Cloudflare and spoof
   the forwarded address.

## Uploads larger than 100 MB

Cloudflare's Free and Pro plans refuse request bodies over **100 MB** (Business: 200 MB, Enterprise: 500 MB).
Links (the usual way to clip) are not affected, because the server downloads the video itself. For big uploads, either:

- set `MAX_UPLOAD_MB=100` in `deploy/.env` so the app tells people the real limit, or
- add a second, **DNS-only (grey cloud)** record such as `upload.clips.example.com` for the same server
  and use that address for large files.

## After a deploy

The HTML shell is never cached, and every new build ships new file names, so a deploy is picked up at
once. There is no need to purge Cloudflare's cache.
