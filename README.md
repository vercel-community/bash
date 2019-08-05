# Bash Builder (`now-bash`)

*Status*: Alpha

The Bash Builder takes an entrypoint of a bash function, imports its dependencies, and bundles them into a Lambda.

A simple "hello world" example:

```bash
handler() {
  echo "Hello, from Bash!"
}
```

## Usage
This example will detail creating an uppercase endpoint which will be accessed as my-deployment.url/api/uppercase. This endpoint will convert the provided querystring to uppercase using only Bash functions and standard Unix CLI tools.

Start by creating the project structure:

```
mkdir -p my-bash-project/api/uppercase
cd my-bash-project/api/uppercase
```

Inside the my-bash-project > api > uppercase directory, create an index.sh file with the following contents:

```bash
import "string@0.0.1"
import "querystring@1.3.0"

handler() {
  local path
  local query
  path="$(jq -r '.path' < "$REQUEST")"
  querystring "$path" | querystring_unescape | string_upper
}
```

A shell function that takes querystrings and prints them as uppercase.

The final step is to define a build that will take this entrypoint (index.sh), build it, and turn it into a lambda using a now.json configuration in the root directory (my-bash-project):

```json
{
  "version": 2,
  "builds": [{ "src": "api/**/index.sh", "use": "now-bash" }]
}
```

Import can be configured by adding options to the import property of the config. The IMPORT_ prefix must not be set in this case:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/**/index.sh",
      "use": "now-bash",
      "config": {
        "import": {
          "DEBUG": "1"
        }
      }
    }
  ]
}
```

A now.json file using a build which takes a shell file and uses the Bash Builder to output a lambda.

The resulting deployment can be seen here: https://bash-o54wu79wa.now.sh/

Note, however, that it will return an empty response without a querystring.

By passing in a querystring, the lambda will return the uppercased version. For example: https://bash-o54wu79wa.now.sh/api/uppercase?hello%20world

## Build Logic
If your Lambda requires additional resources to be added into the final bundle, an optional build() function may be defined.

Any files added to the current working directory at build-time will be included in the output Lambda.

```bash
build() {
  date > build-time.txt
}

handler() {
  echo "Build time:   $(cat build-time.txt)"
  echo "Current time: $(date)"
}
```

Demo: https://bash-build-j3adniz41.now.sh/

## Response Headers
The default Content-Type is text/plain; charset=utf8 but you can change it by setting a response header.

```bash
handler() {
  http_response_header "Content-Type" "text/html; charset=utf8"
  echo "<h1>Current time</h1><p>$(date)</p>"
}
```

Demo: https://bash-html-8vveguuqn.now.sh

## JSON Response
It is common for serverless functions to communicate via JSON so you can use the http_response_json function to set the content type to application/json; charset=utf8.

```bash
handler() {
  http_response_json
  echo "{ "title": "Current time", "body": "$(date)" }"
}
```

Demo: https://bash-json-ffsi051oy.now.sh

## Status Code
The default status code is 200 but you can change it with the http_response_code method.

```bash
handler() {
  http_response_code "500"
  echo "Internal Server Error"
}
```

Demo: https://bash-status-wwxmmk9wh.now.sh

## Redirect
You can use the http_response_redirect function to set the location and status code. The default status code is 302 temporary redirect but you could use a permanent redirect by setting the second argument to 301.

```bash
handler() {
  http_response_redirect "https://twitter.com/zeithq" "301"
  echo "Redirecting..."
}
```

Demo: https://bash-redirect-bmxccvg7c.now.sh

## Importing Dependencies
Bash, by itself, is not very useful for writing Lambda handler logic because it does not have a standard library. For this reason, import is installed and configured by default, which allows your script to easily include additional functionality and helper logic.

For example, the querystring import may be used to parse input parameters from the request URL:

```bash
import "querystring@1.3.0"

handler() {
  local path
  local query
  path="$(jq -r '.path' < "$REQUEST")"
  query="$(querystring "$path")"
  echo "Querystring is: $query"
}
```

Demo: https://bash-querystring-fommsvjvs.now.sh/?a=b

## Bash Version
With the Bash Builder, the handler script is executed using GNU Bash 4.

```bash
handler() {
  bash --version
}
```
Demo: https://bash-version-rkb5w4ua6.now.sh/
