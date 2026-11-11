# Deploy

The app is a static bundle (`vite build` → `dist/`), so it only needs a web
server serving that directory.

> **This is a deliberately minimal example, not a productised pipeline.** It
> exists to publish the app on a small self-hosted machine — one SSH host, nginx,
> `rsync` and a shell script — and it stops there on purpose. If you downloaded
> this repository, treat it as a worked example and **adapt or replace it with
> whatever matches your own setup**: GitHub Pages, Netlify/Vercel/Cloudflare
> Pages, a container image, `systemd` + CI, Ansible/Terraform, whatever you
> already run. Nothing in the app depends on this deployment method.

This folder ships a generic script and an nginx vhost; **every host-specific
value lives in `deploy.env`, which is git-ignored**.

## Configure it once

```bash
cp deploy/deploy.env.example deploy/deploy.env   # then edit it
```

| Variable | Meaning |
| --- | --- |
| `CT_HOST` | Host or IP that serves the site over SSH |
| `CT_USER` | SSH user (default `root`) |
| `KEY` | Private key authorised on that host |
| `SERVER_NAME` | Hostname the vhost answers to (`_` = any name) |
| `WEBROOT` | Directory on the target that receives `dist/` |
| `SITE` | Name of the nginx site |

The same names exported in the shell override the file, so a CI job can pass
them as secrets instead of writing a file.

## Deploy

```bash
./deploy/deploy.sh                # tests + build + rsync + nginx reload + HTTP check
SKIP_BUILD=1 ./deploy/deploy.sh   # push an existing dist/ without rebuilding
```

The script is idempotent: it installs `nginx`/`rsync` on the target if they are
missing, syncs `dist/` with `--delete`, renders `nginx-site.conf` (replacing
`__SERVER_NAME__` and `__WEBROOT__`), installs the vhost, runs `nginx -t`,
reloads and finally fails unless `GET http://<CT_HOST>/` returns `200`.

## What the target needs

- An SSH account reachable with `KEY` (its public half in
  `~/.ssh/authorized_keys`). A freshly created virtual machine or container has
  no alias in `~/.ssh/config`, so the script always passes `-i "$KEY"`.
- `root`, or a user allowed to `apt-get install nginx rsync`, write
  `/etc/nginx/sites-available` and reload nginx.
- Outbound HTTPS if you want the Google Fonts the page loads.

## What this example does **not** do

It is short because it is meant to be read and replaced. Deliberately left out:

- **TLS.** The vhost listens on port 80 only; there is no certificate, no
  redirect, no Let's Encrypt step. Fine on a trusted LAN, not fine on the
  internet.
- **Security headers.** No `Content-Security-Policy`, `X-Content-Type-Options`,
  `Referrer-Policy` or frame protection. A strict policy is feasible here (the
  page uses no inline styles), but choosing one is your call.
- **Atomic releases and rollback.** `rsync --delete` overwrites the live web
  root in place; there is no release directory to switch back to.
- **Least privilege.** It deploys as `root` over SSH.
- **Host identity pinning.** It uses `StrictHostKeyChecking=accept-new`
  (trust on first use) instead of a pinned `known_hosts`.
- **A real health check.** `curl` returning `200` proves a file was served, not
  that the app works.
- **CI/CD.** Nothing runs this automatically on push; there is no pipeline, no
  GitHub Actions workflow, no approvals.

## Cache behaviour

`/assets/*` is served with `Cache-Control: public, immutable` (the filenames are
hashed by Vite); `index.html` is `no-cache`, so a new deploy shows up
immediately instead of being masked by a cached entry point.

## Out of scope

Creating the machine, its address, DNS and firewall belong to whoever runs the
host—not to this script. Point `CT_HOST` at something that already exists.
