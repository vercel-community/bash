handler() {
	http_response_header "Content-Type" "text/html; charset=utf8"
	echo "<h1>Current time</h1><p>$(date)</p>"
}
