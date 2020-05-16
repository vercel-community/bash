handler() {
	http_response_json
	echo "{ \"title\": \"Current time\", \"body\": \"$(date)\" }"
}
