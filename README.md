# server-with-benefits

[![NPM](https://nodei.co/npm/server-with-benefits.png?downloads=true&downloadRank=true)](https://www.npmjs.com/package/server-with-benefits)

[![npm version](https://badge.fury.io/js/server-with-benefits.png)](https://www.npmjs.com/package/server-with-benefits)

A static Node.js file web server with options for proxing requests and delaying/mocking responses. Useful for web development.

## What's new

* v0.14.0 - webpack support!

## Installation

```sh
$ npm install -g server-with-benefits
```

Then, to setup your server(s), edit **_swbConfig.json** that comes with the package and rename it to **swbConfig.json**.  
You can place this file anywhere you like, but make sure you then start the server (see [Usage](#usage)) from the directory where it's placed.    
Alternatively (and *preferably*), you can avoid this restriction by setting an environment variable named **SWB_CONF_FILE**
with the file's full path as its value (e.g. SWB_CONF_FILE=C:\dev\swbConfig.json), or by passing the path as an only argument.

The configuration file should be of the following format:

```javascript
{
	"servers": [
		{
			"port": 80, // the server listen port (default 80)
			"static": { // (OPTIONAL) the static resources that will be served.
				"srcDir": "enter/your/path/here", // path to your local server root source directory
				"paths": { // (OPTIONAL) define routes for specific paths, relative to the 'srcDir'
					"/": "/src", // i.e. http://<your_host_name>/ -> <srcDir>/src
					"/lib": "/lib" // i.e. http://<your_host_name>/lib -> <srcDir>/lib
				}
			},
			"webpack": {
				"confFile": "path/to/your/webpack.config.js"
			},
			"proxy": [ // (OPTIONAL) proxy servers for some path patterns
				{
					"target": { // can be an object with host and port, or a full url string e.g. "http://myproxy:80"
						"host": "hostname",
						"port": 80
					},
					"pathPatterns": [] // e.g. ["^/api/"] or [{"^/api/": "/"}] (for path rewrite)
				}
			],
			"delay": { // (OPTIONAL) Adding delay to responses for some path patterns
				"pathPatterns": [], // e.g. ["^/api/"],
				"time": 2000 // the delay amount
			},
			"fixtures": [ // (OPTIONAL) Fixture definitions
				{
					"active": true, // On/Off switch for this fixture
					"request": {
						"methods": ["GET", "POST"],
						"pathPattern": "^/api/rest/foo",
						// (OPTIONAL) additional condition that checks that the provided object is a subset of
						// the request's payload. This check is relevant only for POST, PUT and OPTIONS methods
						"payload": {
							"name": "bar"
						}
					},
					"response": {
						"status": 200,
						"body": {
							"hello": "Nice Fixture"
						}
					}
				}
				// more fixtures...
			]
		}
		// more servers...
	]
}
```

## Usage

```sh
$ swb [config-file-path]
```
