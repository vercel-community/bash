import "querystring@1.3.0"

handler() {
  local path
  local query
  path="$(jq -r '.path' < "$REQUEST")"
  query="$(querystring "$path")"
  echo "Querystring is: $query"
}
