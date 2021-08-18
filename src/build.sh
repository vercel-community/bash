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

# Install static `curl` binary for production
if [ "${VERCEL_DEV-}" != "1" ]; then
	IMPORT_CURL="$IMPORT_CACHE/bin/curl"
	echo "Installing static \`curl\` binary to \"$IMPORT_CURL\"…"
	curl -sfLS "https://github.com/dtschan/curl-static/releases/download/v7.63.0/curl" > "$IMPORT_CURL"
	chmod +x "$IMPORT_CURL"
	echo "Done installing \`curl\`"
fi

# For now only the entrypoint file is copied into the lambda
mkdir -p "$(dirname "$DIST/$ENTRYPOINT")"
cp "$ENTRYPOINT" "$DIST/$ENTRYPOINT"

cd "$DIST"

# Copy in the runtime
cp "$BUILDER/runtime.sh" "$IMPORT_CACHE"
cp "$BUILDER/bootstrap" "$DIST"

# Load `import`
. "$(command -v import)"

# Cache runtime and user dependencies
echo "Caching imports in \"$ENTRYPOINT\"…"
. "$IMPORT_CACHE/runtime.sh"
. "$DIST/$ENTRYPOINT"
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
