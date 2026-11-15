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

The packaging has been exercised in a local throwaway stack with a local Caddy
certificate. A Google Cloud deployment, public certificate, real provider key,
production resource capacity and hosted acceptance have not been verified.
