# Single-VM deployment

This Compose stack runs the web app, API, worker, and PostgreSQL on one host.
Caddy obtains HTTPS certificates for the configured public hostname. PostgreSQL,
research objects and TLS certificates use persistent named volumes; only ports
80 and 443 are published. This configuration does not mount the Docker socket or
install the qualified gVisor executor, so interactive Python and shell execution
remain unavailable. It does not migrate research saved in another deployment.

The host needs Docker Engine with Compose, outbound access for images and NASA
and OpenAI APIs, and enough memory and disk for builds and the running services.
The capacity required has not been measured. Point a hostname's DNS record to
the VM and allow inbound TCP 80 and 443 before requesting a certificate. A free
IP-based DNS hostname can be used temporarily; its provider and the certificate
issuer must support the chosen address and hostname. VM, external IPv4, network
traffic and model usage can incur charges even when some resources are in a free
tier.

Create a private environment file outside Git (the repository ignores `.env.*`):

```sh
umask 077
openssl rand -hex 32 | sed 's/^/NOVA_POSTGRES_PASSWORD=/' > .env.production
printf 'NOVA_DOMAIN=your-public-hostname.example\n' >> .env.production
printf 'NOVA_DAILY_MODEL_BUDGET_USD=5\nNOVA_REQUEST_MODEL_BUDGET_USD=0.10\n' >> .env.production
```

Replace the example domain. Set the two budgets to the owner's intended limits.
For the research assistant and voice, add `OPENAI_API_KEY` to the same file using
a secure editor or secret handoff; never put the real key in the repository or
image. Avoid displaying the file or expanded Compose configuration. The password
must be URL-safe; the hex generator above ensures that. Changing it later requires
a PostgreSQL password change as well as the environment file.

From the repository root:

```sh
docker compose --env-file .env.production -f infra/production/compose.yaml up -d --build
```

The `seed` service applies migrations and imports the checked-in source corpus
before the API and worker start. On upgrades, retain the named volumes and run the
same command. Avoid `down -v`: it deletes the database, object store and TLS
certificates. Back up the database and research objects before upgrading; test
restoring both together. The generated certificate volume is also persistent.

Check the public HTTPS app and `/v1/health`, browse and search the investigation
catalogue, and exercise a saved research flow, a worker task and a permitted and
rejected cross-origin request. Confirm HTTPS cookies have the Secure attribute,
that secrets never reach the browser, and that data survives a restart. Check
resource use and model spend under representative usage before relying on this
host for submission. A successful Compose build alone is not hosted acceptance.

The initial packaging was exercised in a local throwaway stack with a local Caddy
certificate; the hosted deployment had not yet been verified at that point.

## Automatic updates from GitHub

The optional systemd timer checks the public repository's `main` branch every
three minutes. It builds a separate source snapshot before restarting the stack,
uses the existing `nova-ember` project and named volumes, and records the last
successfully processed revision under `.data/auto-deploy`. Documentation and
media-only changes advance that marker without restarting the application, so the
marker alone does not identify the running image. Builds or readiness failures are recorded in the system
journal and are not retried for the same revision until an operator intervenes.

On the VM, first confirm the actual deployed revision, the remote URL, and that
`/opt/nova-ember/.env.production` contains the existing settings. Replace the
revision below with the actual full deployed commit, then install the timer as root:

```sh
cd /opt/nova-ember
git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
staging=$(mktemp -d /tmp/nova-deployer.XXXXXXXX)
git archive refs/remotes/origin/main \
  infra/production/auto-deploy.sh \
  infra/production/nova-ember-deploy.service \
  infra/production/nova-ember-deploy.timer | tar -x -C "$staging"
install -d -m 700 .data/auto-deploy /usr/local/lib/nova-ember
printf '%s\n' ACTUAL_DEPLOYED_COMMIT > .data/auto-deploy/deployed-revision
install -m 755 "$staging/infra/production/auto-deploy.sh" /usr/local/lib/nova-ember/auto-deploy.sh
install -m 644 "$staging/infra/production/nova-ember-deploy.service" /etc/systemd/system/
install -m 644 "$staging/infra/production/nova-ember-deploy.timer" /etc/systemd/system/
rm -rf "$staging"
systemctl daemon-reload
systemctl enable --now nova-ember-deploy.timer
```

The installed script and unit files are not automatically replaced by future
pushes; reinstall them deliberately when these files change. Check status with
`systemctl status nova-ember-deploy.timer` and inspect runs with
`journalctl -u nova-ember-deploy.service`. After investigating a failure, remove
only `.data/auto-deploy/failed-revision` to retry that revision and start the
service. A failed rollout attempts to restore the previous version only if no
database migrations changed; changed migrations require manual recovery. This
does not back up or restore data, prevent downtime, verify all user workflows, or
guarantee that a previous version can use a changed database. Maintain tested
database and object backups. Release snapshots and build images consume disk.
Run `python3 infra/production/test_auto_deploy.py` for the deployment decision
tests; it also checks Compose paths and volume names when Docker is installed.

## Hosted deployment — 15 November 2026

Nova Ember is available at [nova-ember.duckdns.org](https://nova-ember.duckdns.org/app).
It runs on a Google Cloud VM with a reserved IP and HTTPS. The first verified
deployment used commit `fa0462d`. Public checks covered investigation search, comparison
and automatic rankings, a source-linked assistant answer, and the BASS-II flame
illustration. The browser HTML and script assets checked did not contain the
backend provider key.

Interactive Python and shell execution are unavailable on this host: the existing
sandbox has not been qualified there. Registered analyses and visualizations are
available. Voice, representative concurrent traffic, backup restoration and
full hosted acceptance have not been verified.
