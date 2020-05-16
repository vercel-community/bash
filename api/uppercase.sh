import "string@0.1.0"
import "querystring@1.3.0"

handler() {
	local path
	path="$(jq -r '.path' < "$1")"
	querystring "$path" | querystring_unescape | string_upper
}
