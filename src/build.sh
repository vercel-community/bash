#!/bin/bash
set -euo pipefail

# `import` debug logs are always enabled during build
export IMPORT_DEBUG=1

# Cache runtime and user dependencies
echo "Caching imports in \"$ENTRYPOINT\"…"
. "$BUILDER_DIST/import.sh"
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
