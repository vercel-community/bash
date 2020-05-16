build() {
	date > build-time.txt
}

handler() {
	echo "Build time:   $(cat build-time.txt)"
	echo "Current time: $(date)"
}
