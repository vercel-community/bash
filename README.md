[<img src="https://og-image.vercel.app/**vercel-bash**.png?theme=light&md=1&fontSize=100px&images=https%3A%2F%2Fassets.vercel.com%2Fimage%2Fupload%2Ffront%2Fassets%2Fdesign%2Fvercel-triangle-black.svg&images=https%3A%2F%2Fbashlogo.com%2Fimg%2Fsymbol%2Fsvg%2Ffull_colored_dark.svg&widths=184&widths=250&heights=160&heights=250" />](https://github.com/importpw/vercel-bash)

The Bash Builder takes an entrypoint of a Bash function, imports its
dependencies, and bundles them into a serverless function.

A simple "hello world" example:

```bash
handler() {
	echo "Hello, from $(bash --version | head -n1)"
}
```

**Demo:** https://vercel.import.sh/api/hello


## Usage

This example will detail creating an uppercase endpoint which will be accessed
as https://my-deployment.url/api/uppercase. This endpoint will convert the
provided querystring to uppercase using only Bash functions and standard Unix
CLI tools.

Start by creating the project structure:

```bash
mkdir -p my-bash-project/api/uppercase
cd my-bash-project/api/uppercase
```

Inside the `my-bash-project/api/uppercase` directory, create an `index.sh` file
with the following contents:

```bash
import "string@0.0.1"
import "querystring@1.3.0"

handler() {
	local path
	path="$(jq -r '.path' < "$1")"
	querystring "$path" | querystring_unescape | string_upper
}
```

The final step is to define a build that will take this entrypoint (`index.sh`),
build it, and turn it into a serverless function using a `vercel.json`
configuration in the root directory (`my-bash-project`):

```json
{
	"version": 2,
	"functions": {
		"api/*.sh": { "runtime": "vercel-bash@4.1.0" }
	}
}
```

Import can be configured by adding options to the import property of the config.
The `IMPORT_` prefix must not be set in this case:

```json
{
	"version": 2,
	"functions": {
		"api/*.sh": {
			"runtime": "vercel-bash@4.1.0",
			"config": {
				"import": {
					"DEBUG": "1"
				}
			}
		}
	}
}
```

By passing in a querystring, the endpoint will return the uppercased version.

**Demo:** https://vercel.import.sh/api/uppercase?hello%20world

## Build Logic

If your serverless function requires additional files to be added into the
final bundle, an optional `build()` function may be defined.

Any files added to the current working directory at build-time will be included
in the output serverless function.

```bash
build() {
	date > build-time.txt
}

handler() {
	echo "Build time:   $(cat build-time.txt)"
	echo "Current time: $(date)"
}
```

**Demo:** https://vercel.import.sh/api/build

## Response Headers

The default `Content-Type` is `text/plain; charset=utf8` but you can change it by
setting a response header.

```bash
handler() {
	http_response_header "Content-Type" "text/html; charset=utf8"
	echo "<h1>Current time</h1><p>$(date)</p>"
}
```

**Demo:** https://vercel.import.sh/api/response-headers

## JSON Response

It is common for serverless functions to communicate via JSON, so you can use the
`http_response_json` function to set the `Content-Type` to `application/json;
charset=utf8`.

```bash
handler() {
	http_response_json
	echo "{ \"title\": \"Current time\", \"body\": \"$(date)\" }"
}
```

**Demo:** https://vercel.import.sh/api/response-json

## Status Code

The default status code is `200` but you can change it with the
`http_response_code` function.

```bash
handler() {
	http_response_code 500
	echo "Internal Server Error from Bash!"
}
```

**Demo:** https://vercel.import.sh/api/response-status-code

## Redirect

You can use the `http_response_redirect` function to set the location and,
optionally, the status code. The default status code is `302` (temporary
redirect) but you could use a permanent redirect by setting the second argument
to `301`.

```bash
handler() {
	http_response_redirect "https://twitter.com/vercel" 301
	echo "Redirecting..."
}
```

**Demo:** https://vercel.import.sh/api/redirect

## Importing Dependencies

Bash, by itself, is not very useful for writing serverless function handler logic
because it does not have a standard library. For this reason,
[`import`](https://import.sh) is installed and configured by default, which allows
your script to easily include additional functionality and helper logic.

For example, the querystring import may be used to parse input parameters from
the request URL:

```bash
import "querystring@1.3.0"

handler() {
	local path
	local query
	path="$(jq -r '.path' < "$1")"
	query="$(querystring "$path")"
	echo "Querystring is: $query"
}
```

**Demo:** https://vercel.import.sh/api/querystring?a=b

## Bash Version

With the Bash Builder, the handler script is executed using GNU Bash 4.

```bash
handler() {
	bash --version
}
```

**Demo:** https://vercel.import.sh/api/bash-version
