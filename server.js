
var fs = require('fs');
var stripJsonComments = require('strip-json-comments');
var clc = require('cli-color');
var _ = require('underscore');

const 
	ENV_VAR_KEY = 'SWB_CONF_FILE',
	CONF_FILE = process.argv[2] || process.env[ENV_VAR_KEY] || (process.cwd() + '/swbConfig.json'),
	// Console text styling
	errorStyle = clc.red.bold,
	headerStyle = clc.yellow.bold,
	fileStyle = clc.blueBright,
	confFileStyle = clc.cyan,
	portStyle = clc.greenBright,
	proxyStyle = clc.magenta,
	delayTimeStyle = clc.red,
	featureStyle = clc.yellow,
	boldStyle = clc.bold;

console.log("\nEnvironment variable " + ENV_VAR_KEY + " is " + (process.env[ENV_VAR_KEY] ? "defined." : "missing!") +
	"\nReading configuration from file: " + confFileStyle(CONF_FILE));

var runningExpressServers = [];
var conf;
try {
	conf = JSON.parse(stripJsonComments(fs.readFileSync(CONF_FILE, 'utf8')));
}
catch (e) {}

if (!conf || !Array.isArray(conf.servers) || !conf.servers.length) {
	console.error(errorStyle("\nError: Problem parsing servers configuration file." +
	"\nPlease check it and run again."));
	return;
}

console.log('config file (' + CONF_FILE + ') was last modified: ', fs.statSync(CONF_FILE).mtime);

var express = require('express');
var bodyParser = require('body-parser');
var httpProxy = require('http-proxy');
var _ = require('underscore');

var proxy = httpProxy.createProxyServer();
proxy.on('error', function (err, req, res) {
	res.writeHead(500, {
		'Content-Type': 'text/plain'
	});
	res.end("SWB: Error occurred when trying to reach proxy server");
});

var getDelayCheckRequestHandler = function(pathRegExp, delay) {
	return function(req, res, next) {
		if (pathRegExp.test(req.url)) {
			setTimeout(next, delay);
		}
		else {
			next();
		}
	};
};
var getFixtureCheckRequestHandler = function(fixtures) {
	return function(req, res, next) {
		if (!fixtures.some(function(fixture) {
			if (fixture.methodRegExp.test(req.method) && fixture.pathRegExp.test(req.url)) {
				if (fixture.payload && _.contains(['POST', 'PUT', 'OPTIONS'], req.method)) {
					if (!_.isEqual(_.pick(req.body, _.keys(fixture.payload)), fixture.payload)) {
						return false;
					}
				}
				res.json(fixture.response.status, fixture.response.body || {});
				return true;
			}
		})) {
			next();
		}
	};
};
var getProxyCheckRequestHandler = function(pathRegExp, proxyTarget, pathRewrite) {
	return function(req, res, next) {
		if (pathRegExp.test(req.url)) {
			if (pathRewrite != null) {
				req.url = req.url.replace(new RegExp(pathRegExp), pathRewrite);
			}
			proxy.web(req, res, {
				target: proxyTarget
			});
		}
		else {
			next();
		}
	};
};
var configureServers = function(conf) {
    console.log('re/configuring servers ... ')
    conf.servers.forEach(function (serverConf) {
        var app = express(),
            messages = "\n" + headerStyle("Serving ") + (serverConf.static && serverConf.static.srcDir ? fileStyle(serverConf.static.srcDir) + " " : "") + "on port " + portStyle(serverConf.port);
        if (serverConf.delay) {
            app.use(getDelayCheckRequestHandler(new RegExp("(?:" + serverConf.delay.pathPatterns.join(")|(?:") + ")"), serverConf.delay.time));
            messages += "\n" + featureStyle("Delay") + " of " + delayTimeStyle(serverConf.delay.time + " ms") + " is activated for path patterns: " + boldStyle(serverConf.delay.pathPatterns.join(", "));
        }
        if (serverConf.fixtures) {
            var activeFixtures = serverConf.fixtures.filter(function (fixture) {
                    return fixture.active;
                }),
                useBodyParser = false;
            activeFixtures.forEach(function (fixture) {
                fixture.request.methods.forEach(function (method, i, methods) {
                    methods[i] = method.toUpperCase();
                });
                fixture.methodRegExp = new RegExp("(?:" + fixture.request.methods.join(")|(?:") + ")");
                fixture.pathRegExp = new RegExp(fixture.request.pathPattern);
                if (fixture.request.payload) {
                    useBodyParser = true;
                    fixture.payload = fixture.request.payload;
                }
                messages += "\n" + featureStyle("Fixture") + " is enabled for methods " + boldStyle(fixture.request.methods.join(", ")) + " and path pattern " + boldStyle(fixture.request.pathPattern);
                fixture.request.payload && (messages += " with payload " + JSON.stringify(fixture.request.payload));
            });
            useBodyParser && app.use(bodyParser.json());
            app.use(getFixtureCheckRequestHandler(activeFixtures));
        }
        if (serverConf.proxy) {
            serverConf.proxy.forEach(function (proxy) {
                var simplePaths = [];
                var pathRewrites = [];
                proxy.pathPatterns.forEach(function (path) {
                    (typeof path == 'string' ? simplePaths : pathRewrites).push(path);
                });
                if (simplePaths.length) {
                    app.use(getProxyCheckRequestHandler(new RegExp("(?:" + simplePaths.join(")|(?:") + ")"), proxy.target));
                    messages += "\n" + featureStyle("Redirecting") + " path patterns: " + boldStyle(simplePaths.join(", ")) + " to "
                        + proxyStyle((typeof proxy.target == 'string' ? proxy.target : (proxy.target.host + ":" + proxy.target.port)) + " (same path)");
                }
                pathRewrites.forEach(function (pathObj) {
                    var pathRegExp = Object.keys(pathObj)[0];
                    var pathRewrite = pathObj[pathRegExp];
                    app.use(getProxyCheckRequestHandler(new RegExp(pathRegExp), proxy.target, pathRewrite));
                    messages += "\n" + featureStyle("Redirecting") + " path patterns: " + boldStyle(pathRegExp) + " to "
                        + proxyStyle((typeof proxy.target == 'string' ? proxy.target : (proxy.target.host + ":" + proxy.target.port)) + "/" + pathRewrite);
                });
            });

        }

        // One webpack file for all servers
        if (conf.webpack) {
            console.log('using one webpack conf file for all servers');
            if (!conf.webpackCompile || !conf.webpackDevMiddlewareObject) {
                console.log('Running ' + boldStyle('webpack') + ' from global conf')
                conf.webpackCompile = require('webpack')(require(conf.webpack.confFile));
                conf.webpackDevMiddlewareObject = require('webpack-dev-middleware')(conf.webpackCompile)
            }
            app.use(conf.webpackDevMiddlewareObject);
        }
        else if (serverConf.webpack) {
            if (!serverConf.webpackCompile || !serverConf.webpackDevMiddlewareObject) {
                console.log('Running ' + boldStyle('webpack'))
                serverConf.webpackCompile = require('webpack')(require(serverConf.webpack.confFile));
                serverConf.webpackDevMiddlewareObject = require('webpack-dev-middleware')(serverConf.webpackCompile)
            }
            app.use(serverConf.webpackDevMiddlewareObject);
        }
        else if (serverConf.static && serverConf.static.srcDir) {
            if (serverConf.static.paths) {
                for (var path in serverConf.paths) {
                    app.use(path, express.static(serverConf.static.srcDir + serverConf.static.paths[path]));
                }
            }
            app.use(express.static(serverConf.static.srcDir));
        }

	var expressServer = app.listen(serverConf.port);
        expressServer.timeout = 5000;
        console.log('setting express server timeout to: ' + expressServer.timeout + 'ms');

        runningExpressServers.push(expressServer);
        console.log('added express server to log, now running  ' + runningExpressServers.length + ' servers')

        if (!conf.isConfFileWatched) {
            console.log('Watching conf file for changes - ', confFileStyle(CONF_FILE));
            conf.isConfFileWatched = true;

            fs.watchFile(CONF_FILE, {}, function () {

                console.log('Stop watching conf file for changes - ', confFileStyle(CONF_FILE));
                fs.unwatchFile(CONF_FILE);
                conf.isConfFileWatched = false;

                console.log('going to stop servers: ', runningExpressServers.length)
                stopAllExpressServers(runningExpressServers.slice(0), function () {
                    console.log('all servers stopped now');
                    var _conf = JSON.parse(stripJsonComments(fs.readFileSync(CONF_FILE, 'utf8')));

                    conf.servers = _.map(_conf.servers, function (_conf_item) {
                        if (_conf_item.port === serverConf.port) {
                            console.log('port ' + _conf_item.port + ', changing props')
                            _conf_item.webpackCompile = conf.webpack ? conf.webpackCompile : serverConf.webpackCompile;
                            _conf_item.webpackDevMiddlewareObject = conf.webpack ? conf.webpackDevMiddlewareObject : serverConf.webpackDevMiddlewareObject;
                        }
                        return _conf_item;
                    });
                    runningExpressServers = [];
                    console.log('running new configuration and starting servers.')
                    configureServers(conf)
                });
            });
        }
        console.log(messages);
    });
}

var stopAllExpressServers = function (servers, callback) {
    console.log(errorStyle('stopping all express servers, (' + servers.length + '), in order to start them with new configuration'))

    var server = servers.shift();

    if (server && typeof server.close === 'function') {
        if (servers.length === 0) {
            console.log('stopAllExpressServers, stopping express server ... last ')
            server.close(callback);
        } else {
            console.log('stopAllExpressServers, running close() with other servers: ', servers.length)
            server.close(stopAllExpressServers.bind(this, servers, callback))
        }
    }
}

configureServers(conf);
