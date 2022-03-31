#!/bin/bash
set -euo pipefail

# `import` debug logs are always enabled during build
export IMPORT_DEBUG=1

# Install `import`
IMPORT_BIN="$IMPORT_CACHE/bin/import"
echo "Installing \`import\` to \"$IMPORT_BIN\"…"
mkdir -p "$(dirname "$IMPORT_BIN")"
curl -sfLS "https://import.sh" > "$IMPORT_BIN"
chmod +x "$IMPORT_BIN"
echo "Done installing \`import\`"

# Cache runtime and user dependencies
echo "Caching imports in \"$ENTRYPOINT\"…"
. "$IMPORT_BIN"
. "$WORK_PATH/$ENTRYPOINT"
echo "Done caching imports"

# Ensure the entrypoint defined a `handler` function
if ! declare -f handler > /dev/null; then
	echo "ERROR: A \`handler\` function must be defined in \"$ENTRYPOINT\"!" >&2
	exit 1
fi

# Run user build script
if declare -f build > /dev/null; then
	echo "Running \`build\` function in \"$ENTRYPOINT\"…"
	build "$@"
fi
