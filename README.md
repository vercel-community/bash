# Verecl Bash Runtime (`vercel-bash`)

The Bash Builder takes an entrypoint of a Bash function, imports its
dependencies, and bundles them into a Lambda.

A simple "hello world" example:

```bash
handler() {
  echo "Hello, from Bash!"
}
```

**Demo:** https://vercel.import.pw/api/hello


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
  local query
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
    "api/*.sh": { "runtime": "vercel-bash@3.0.4" }
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
      "runtime": "vercel-bash@3.0.4",
      "config": {
        "import": {
          "DEBUG": "1"
        }
      }
    }
  }
}
```

By passing in a querystring, the lambda will return the uppercased version.

**Demo:** https://vercel.import.pw/api/uppercase?hello%20world

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

**Demo:** https://vercel.import.pw/api/build

## Response Headers

The default `Content-Type` is `text/plain; charset=utf8` but you can change it by
setting a response header.

```bash
handler() {
  http_response_header "Content-Type" "text/html; charset=utf8"
  echo "<h1>Current time</h1><p>$(date)</p>"
}
```

**Demo:** https://vercel.import.pw/api/response-headers

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

**Demo:** https://vercel.import.pw/api/response-json

## Status Code

The default status code is `200` but you can change it with the
`http_response_code` function.

```bash
handler() {
  http_response_code 500
  echo "Internal Server Error"
}
```

**Demo:** https://vercel.import.pw/api/response-status-code

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

**Demo:** https://vercel.import.pw/api/redirect

## Importing Dependencies

Bash, by itself, is not very useful for writing serverless function handler logic
because it does not have a standard library. For this reason,
[`import`](https://import.pw) is installed and configured by default, which allows
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

**Demo:** https://vercel.import.pw/api/querystring?a=b

## Bash Version

With the Bash Builder, the handler script is executed using GNU Bash 4.

```bash
handler() {
  bash --version
}
```

**Demo:** https://vercel.import.pw/api/bash-version
