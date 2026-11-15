# Third-party notices from local application images

These archives preserve unmodified license and notice files found in the **local Linux images inspected on 15 November 2026**. They supplement the [package inventory](../../third-party-software-2026-11-15.md) and the repository's own [Apache-2.0 license](../../../LICENSE). They are a record of the inspected images, not proof of the contents of a later deployment or a complete review of every component, redistribution condition, or source-offer obligation.

| Local image | Image ID | Notice files | Installed OS packages |
| --- | --- | --- | --- |
| `nova-ember-api:latest` | `sha256:ebff9347d76576021a5070dc08aab9c6fb50398dcc61efad181d830f620b4ee1` | [Python package notices](nova-api-package-notices.tar.gz), [OS copyright notices](nova-api-os-notices.tar.gz) | [Package/version list](nova-api-os-packages.tsv) |
| `nova-ember-web:latest` | `sha256:2df8bf2e75bd8d5ef493fe881f577de55faafec730bb104ee90f3b6cc6ab8e72` | [JavaScript package notices](nova-web-package-notices.tar.gz), [OS copyright notices](nova-web-os-notices.tar.gz) | [Package/version list](nova-web-os-packages.tsv) |
| `pgvector/pgvector:pg17` | `sha256:8bce63b3aa8181e9c040468016e7df9c82fb9400c40df9e731752bed2965d8ef` | [OS and pgvector notices](pgvector-os-notices.tar.gz) | [Package/version list](pgvector-os-packages.tsv) |
| `nova-ember-science:c488c3ad21e8cc8d` | `sha256:1e2b35d07862cd99a7de909e495b8c06c0568d8f7ed81323e94497a9c409eb6d` | [Python notices](science-python-notices.tar.gz), [OS notices](science-os-notices.tar.gz) | [Package/version list](science-os-packages.tsv) |
| `caddy:2` | `sha256:5813f7eb9b94fac4970f9f576695fe1ed1d53d41586fd3eaa350caf7c4627d9c` | [Caddy 2.11.9 upstream license](https://github.com/caddyserver/caddy/blob/v2.11.9/LICENSE), [Go build metadata](caddy-go-build-info.tsv) | [Alpine packages and declared license metadata](caddy-alpine-packages.tsv) |

## What was collected

- Package archives contain regular files whose names start with `license`, `copying`, `notice`, or `copyrightnotice` (case-insensitive) in `/app/.venv/lib/python3.13/site-packages` for the API and `/app/node_modules/.pnpm` for the web image. Paths retain their image-relative locations. The API archive contains 102 files; an independent Python metadata check found a recognized license/notice filename for all 66 installed distributions. The web archive contains 291 files. Some are nested component notices and some may be for build or development dependencies retained in the image.
- OS archives contain the regular files named `copyright` directly inside each `/usr/share/doc/<package>/` directory: 286 files for the API image and 86 for the web image. The separate lists are the image's `dpkg-query` package names and versions (292 API and 88 web entries). The counts need not match: package documentation is not a one-to-one mapping, and additional notices can be stored elsewhere.
- The science image yielded 102 Python notice files and 84 OS notices; all 66 installed Python distributions had a recognized notice filename. The pgvector image yielded 153 notice files including the pgvector license. Package/version lists record 87 science and 163 pgvector OS entries. The Caddy Alpine image did not include a populated `/usr/share/doc` notice collection; the package list is from its installed APK database, while `caddy build-info` identifies linked Go modules and versions (trailing whitespace normalized). Their individual license texts have not been collected.
- The API, worker and seed local images have identical filesystem layer lists, despite different image IDs and configurations; the API notice collection therefore covers those common layers.
- The files are reproduced exactly as found in the inspected images. See an archive's contents with `tar -tzf <archive>` and extract individual records as needed. The archives do not contain the complete software or corresponding source.

**FreeType acknowledgment:** This project uses Matplotlib, which includes software developed by the [FreeType Project](https://www.freetype.org/). Matplotlib's license file describes the FreeType License's acknowledgment condition; verify the chosen terms against the actual distributed artifact.

## Remaining release-specific work

Check the exact final image digests and regenerate the evidence if they differ. Inspect package metadata, license files with other names, statically bundled dependencies, native libraries, and notices within the actual build output and final web bundle. Identify which packages are conveyed and satisfy their applicable conditions, including copyright notices and any source, relinking or offer requirements. In particular, the locally inspected `psycopg-binary` wheel bundles additional shared libraries whose exact provenance and licenses are not fully resolved by its own license file. Check that the inspected PostgreSQL/pgvector, scientific sandbox and proxy images match the release. Review the Caddy binary’s linked Go-module licenses and Alpine package obligations; the APK metadata and upstream Caddy license alone are not a complete notice bundle. The lockfile's platform-conditional packages may differ from the locally inspected Linux image.

## Archive SHA-256

```text
6fdf047fad8eeeca585ffd10f6f9f89fc7688500b9a60e55a4e95bd7be20827d  nova-api-os-notices.tar.gz
be6054d0d9d34a9bb6d3e79fcd2889cc73d79be1e3c4ef7d1a04088f10bde0f3  nova-api-os-packages.tsv
bb584416e4950572152c4b40aa9e8c083d3cefef1f9cfa31a8038fd413a513cd  nova-api-package-notices.tar.gz
42ad32a97eccefa4fbe75fe269d0a1593518e23ee060916b478d4a45b503f81f  nova-web-os-notices.tar.gz
5b70830b581cbcf2cac1ef4f4d2ef5c9390e01437c9bf2ed8af947a4bfc356f1  nova-web-os-packages.tsv
854dbeaa9b6c31720878b8c88a7d0f20c95504a6bc555a1b868af3a8eb969233  nova-web-package-notices.tar.gz
fdcf1c6de79db5989934c2b15c91e3c5c9e7393eccfbbf04a82e000360abd00e  pgvector-os-notices.tar.gz
3e6e928724426db9f637a2440a5ba5a093e92ecac6bdd5e03d6b8dc49edae39c  pgvector-os-packages.tsv
72dcb15895584fb8d4d90cd29b9806392a43da9be51305a6b854e3887039c88e  science-python-notices.tar.gz
308d6b13a005a11fe15e1f62c8b12966ea2611f558594949211390c5bbed5388  science-os-notices.tar.gz
54278395e0f1911fc4f05abadc18419b15d704fe6c88336acaecaa4886af38ca  science-os-packages.tsv
69de42f8f4943023cabf4072e5e9b6b966219b917a4a7173d69476fed7b3cf58  caddy-go-build-info.tsv
6ecd1ce5f3edef22db03067034233ecd260997045c1a302e497427c1369a478b  caddy-alpine-packages.tsv
```
