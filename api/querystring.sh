import "querystring@1.3.0"

handler() {
	local path
	local query
	path="$(jq -r '.path' < "$1")"
	query="$(querystring "$path")"
	echo "Querystring is: $query"
}
