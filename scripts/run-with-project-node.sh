#!/usr/bin/env sh

set -eu

if [ "$#" -eq 0 ]; then
  echo "WorkSync hook error: no command was provided." >&2
  exit 1
fi

repository_root=$(git rev-parse --show-toplevel)
version_file="$repository_root/.nvmrc"
home_directory=${HOME:-}

if [ ! -f "$version_file" ]; then
  echo "WorkSync hook error: $version_file is missing." >&2
  exit 1
fi

selected_node=$(tr -d '[:space:]' < "$version_file")
expected_major=$(printf '%s' "$selected_node" | sed 's/^v//' | cut -d. -f1)
case "$expected_major" in
  ""|*[!0-9]*)
    echo "WorkSync hook error: unsupported Node.js version in .nvmrc: $selected_node" >&2
    exit 1
    ;;
esac

current_major=""
current_version="unavailable"
if command -v node >/dev/null 2>&1; then
  current_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)
  current_version=$(node --version 2>/dev/null || printf 'unavailable')
fi

cd "$repository_root"

if [ "$current_major" = "$expected_major" ]; then
  exec "$@"
fi

fnm_command=""
if command -v fnm >/dev/null 2>&1; then
  fnm_command=$(command -v fnm)
else
  for candidate in \
    /opt/homebrew/bin/fnm \
    /usr/local/bin/fnm \
    "$home_directory/.local/share/fnm/fnm" \
    "$home_directory/.cargo/bin/fnm"
  do
    if [ -x "$candidate" ]; then
      fnm_command=$candidate
      break
    fi
  done
fi

if [ -n "$fnm_command" ]; then
  echo "WorkSync hook: switching from Node.js $current_version to $selected_node via fnm."
  exec "$fnm_command" exec --using="$version_file" -- "$@"
fi

nvm_directory=${NVM_DIR:-"$home_directory/.nvm"}
if [ -s "$nvm_directory/nvm.sh" ]; then
  # nvm is a shell function, so its initialization must run in this process.
  # shellcheck disable=SC1090
  . "$nvm_directory/nvm.sh"
  echo "WorkSync hook: switching from Node.js $current_version to $selected_node via nvm."
  nvm exec "$selected_node" "$@"
  exit $?
fi

echo "WorkSync hook error: Node.js $selected_node is required; current version is $current_version." >&2
echo "Install or activate the version from .nvmrc with fnm or nvm, then retry." >&2
exit 1
