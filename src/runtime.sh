#!/bin/bash
# The static `curl` binary we download for AWS Lambda has the incorrect
# location for the SSL Certs CA, so set the proper location in production
if [ -e "/etc/ssl/certs/ca-bundle.crt" ]; then
	export CURL_CA_BUNDLE="/etc/ssl/certs/ca-bundle.crt"
fi

# These get reset upon each request
_STATUS_CODE="$(mktemp)"
_HEADERS="$(mktemp)"

_vercel_bash_runtime_api() {
	local endpoint="$1"
	shift
	curl -sfLS "http://$AWS_LAMBDA_RUNTIME_API/2018-06-01/runtime/$endpoint" "$@"
}

_vercel_bash_runtime_init() {
	# Initialize user code
	# shellcheck disable=SC1090
	. "$_HANDLER" || {
		local exit_code="$?"
		local error_message="Initialization failed for '$_HANDLER' (exit code $exit_code)"
		echo "$error_message" >&2
		local error='{"errorMessage":"'"$error_message"'"}'
		_vercel_bash_runtime_api "init/error" -X POST -d "$error"
		exit "$exit_code"
	}

	# Process events
	while true; do _vercel_bash_runtime_next; done
}

_vercel_bash_runtime_next() {
	echo 200 > "$_STATUS_CODE"
	echo '{"content-type":"text/plain; charset=utf8"}' > "$_HEADERS"

	local headers
	headers="$(mktemp)"

	# Get an event
	local event
	event="$(mktemp)"
	_vercel_bash_runtime_api invocation/next -D "$headers" | jq --raw-output --monochrome-output '.body' > "$event"

	local request_id
	request_id="$(grep -Fi Lambda-Runtime-Aws-Request-Id "$headers" | tr -d '[:space:]' | cut -d: -f2)"
	rm -f "$headers"

	# Execute the handler function from the script
	local body
	body="$(mktemp)"

	# Stdin of the `handler` function is the HTTP request body.
	# Need to use a fifo here instead of bash <() because Lambda
	# errors with "/dev/fd/63 not found" for some reason :/
	local stdin
	stdin="$(mktemp -u)"
	mkfifo "$stdin"
	_vercel_bash_runtime_body < "$event" > "$stdin" &

	local exit_code=0
	handler "$event" < "$stdin" > "$body" || exit_code="$?"

	rm -f "$event" "$stdin"

	if [ "$exit_code" -eq 0 ]; then
		# Send the response
		jq --raw-input --raw-output --compact-output --slurp --monochrome-output \
			--arg statusCode "$(cat "$_STATUS_CODE")" \
			--argjson headers "$(cat "$_HEADERS")" \
			'{statusCode:$statusCode|tonumber, headers:$headers, encoding:"base64", body:.|@base64}' < "$body" \
			| _vercel_bash_runtime_api "invocation/$request_id/response" -X POST -d @- > /dev/null
		rm -f "$body" "$_HEADERS"
	else
		local error_message="Invocation failed for 'handler' function in '$_HANDLER' (exit code $exit_code)"
		echo "$error_message" >&2
		_vercel_bash_runtime_api "invocation/$request_id/error" -X POST -d '{"errorMessage":"'"$error_message"'"}' > /dev/null
	fi
}

_vercel_bash_runtime_body() {
	local event
	event="$(cat)"
	if [ "$(jq --raw-output '.body | type' <<< "$event")" = "string" ]; then
		if [ "$(jq --raw-output '.encoding' <<< "$event")" = "base64" ]; then
			jq --raw-output '.body' <<< "$event" | base64 --decode
		else
			# assume plain-text body
			jq --raw-output '.body' <<< "$event"
		fi
	fi
}


# Set the response status code.
http_response_code() {
	echo "$1" > "$_STATUS_CODE"
}

# Sets a response header.
# Overrides existing header if it has already been set.
http_response_header() {
	local name="$1"
	local value="$2"
	local tmp
	tmp="$(mktemp)"
	jq \
		--arg name "$name" \
		--arg value "$value" \
		'.[$name | ascii_downcase] = $value' < "$_HEADERS" > "$tmp"
	mv -f "$tmp" "$_HEADERS"
}

http_response_redirect() {
	http_response_code "${2:-302}"
	http_response_header "location" "$1"
}

http_response_json() {
	http_response_header "content-type" "application/json; charset=utf8"
}
