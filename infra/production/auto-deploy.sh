#!/usr/bin/env bash
# Run as root on the VM. The source checkout and Compose volumes stay in place.
set -Eeuo pipefail

root=/opt/nova-ember
state="$root/.data/auto-deploy"
repository=https://github.com/ScientificAJ/Strawhat-Pirates-2026.git
env_file="$root/.env.production"
mkdir -p "$state/releases"
exec 9>"$state/lock"
flock -n 9 || { echo 'Another deployment is running.'; exit 0; }
cd "$root"

test -f "$env_file" || { echo 'Missing production environment file.' >&2; exit 1; }
test -f "$state/deployed-revision" || { echo 'Initialize deployed-revision before enabling the timer.' >&2; exit 1; }
test "$(git remote get-url origin)" = "$repository" || { echo 'Unexpected Git remote.' >&2; exit 1; }
old=$(cat "$state/deployed-revision")
git cat-file -e "$old^{commit}"
git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main
target=$(git rev-parse refs/remotes/origin/main)
git merge-base --is-ancestor "$old" "$target" || { echo 'Remote main does not descend from the deployed revision.' >&2; exit 1; }
if [[ "$old" == "$target" ]]; then
  echo "Already checked $target."
  exit 0
fi
if [[ -f "$state/failed-revision" ]] && [[ "$(cat "$state/failed-revision")" == "$target" ]]; then
  echo "Revision $target previously failed; inspect the journal before retrying." >&2
  exit 1
fi

# Documentation and presentation assets are not in either production image.
if git diff --quiet "$old" "$target" -- . ':!docs/**' ':!media/**' ':!README.md' ':!infra/production/README.md'; then
  printf '%s\n' "$target" > "$state/deployed-revision.tmp"
  mv "$state/deployed-revision.tmp" "$state/deployed-revision"
  rm -f "$state/failed-revision"
  echo "Recorded documentation-only revision $target; running services unchanged."
  exit 0
fi

release() {
  local revision=$1 directory="$state/releases/$1"
  if [[ ! -f "$directory/infra/production/compose.yaml" ]]; then
    local temporary
    temporary=$(mktemp -d "$state/releases/.extract.XXXXXXXX")
    if ! git archive "$revision" | tar -xf - -C "$temporary"; then
      rm -rf "$temporary"
      return 1
    fi
    mv "$temporary" "$directory"
  fi
}
compose() {
  local revision=$1
  shift
  docker compose --project-name nova-ember --env-file "$env_file" \
    -f "$state/releases/$revision/infra/production/compose.yaml" "$@"
}
release "$old"
release "$target"
echo "Building revision $target before changing running services."
if ! compose "$target" build; then
  printf '%s\n' "$target" > "$state/failed-revision"
  echo 'Build failed; running services were not restarted.' >&2
  exit 1
fi
ready() {
  compose "$1" exec -T web node -e 'fetch("http://127.0.0.1:3100/app", {signal: AbortSignal.timeout(10000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
}
if ! compose "$target" up --detach --no-build --wait --wait-timeout 180 || ! ready "$target"; then
  printf '%s\n' "$target" > "$state/failed-revision"
  if git diff --quiet "$old" "$target" -- services/api/src/nova_ember/api/migrations; then
    echo 'Deployment failed; attempting to restore the previous release.' >&2
    if ! compose "$old" up --detach --build --wait --wait-timeout 180 || ! ready "$old"; then
      echo 'Automatic restoration failed; manual attention is required.' >&2
    fi
  else
    echo 'Deployment failed after a migration change; automatic code rollback is unsafe. Manual attention is required.' >&2
  fi
  exit 1
fi
printf '%s\n' "$target" > "$state/deployed-revision.tmp"
mv "$state/deployed-revision.tmp" "$state/deployed-revision"
rm -f "$state/failed-revision"
echo "Deployed revision $target."
