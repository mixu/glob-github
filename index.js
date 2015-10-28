var wildglob = require('wildglob');
var parse = require('glob-parse');
var xtend = require('xtend');
var GitHubApi = require('github');
var github = new GitHubApi({
  version: '3.0.0'
});
var Lifecycle = require('./lifecycle.js');

var sharedCache = {};
var lifecycle = new Lifecycle();

function toCacheStr(opts) {
  return Object.keys(opts).sort().map(function(key) { return opts[key]; }).join('/');
}

var limit = Infinity;

module.exports = function(opts, onDone) {
  if (opts.github) {
    github = opts.github;
  } else if (opts.authenticate) {
    github.authenticate(opts.authenticate);
  }
  var cache = opts.cache || sharedCache;

  if (!cache[opts.user + '/' + opts.repo]) {
    cache[opts.user + '/' + opts.repo] = {};
  }
  cache = cache[opts.user + '/' + opts.repo];
  if (!cache.stat) {
    // path to stat cache
    cache.stat = {};
  }
  // ensure glob basepath exists
  var basepath = parse.basename(opts.glob) || '/';
  if (!cache.stat[basepath]) {
    cache.stat[basepath] = {
      size: 0,
      isFile: function() {
        return false;
      },
      isDirectory: function() {
        return true;
      },
    };
  }
  if (!cache.readdir) {
    cache.readdir = {};
  }
  if (!cache.http) {
    cache.http = {};
  }

  var cacheHits = 0;
  var apiCalls = 0;
  var baseOpts = {
    user: opts.user,
    repo: opts.repo,
  };
  if (opts.branch) {
    baseOpts.ref = opts.branch;
  }

  wildglob(opts.glob, {
    cwd: '/',
    fs: {
      stat: function(path, onDone) {
        process.nextTick(function() {
          var slashPath = path.charAt(0) === '/' ? path : '/' + path;
          if (!cache.stat[slashPath]) {
            throw new Error('Missing path: ' + path);
          }
          return onDone(null, cache.stat[slashPath]);
        });
      },
      readdir: function(path, onDone) {
        var fetchOpts = xtend(baseOpts, {
          path: path.replace(/^\//, '').replace(/\/$/, '') || ''
        });
        var cacheStr = toCacheStr(fetchOpts);

        if (cache.readdir[cacheStr]) {
          process.nextTick(function() {
            cacheHits++;
            onDone(null, cache.readdir[cacheStr]);
          });
          return;
        }
        if (lifecycle.isBlocking(cacheStr)) {
          // the post-processing function has already done all the work for us,
          // so just return from the readdir call.
          lifecycle.onRelease(cacheStr, function() {
            cacheHits++;
            onDone(null, cache.readdir[cacheStr]);
          });
          return;
        }
        lifecycle.block(cacheStr);

        apiCalls++;
        github.repos.getContent(fetchOpts, function(err, files) {
          // update rate limit
          if (files && files.meta['x-ratelimit-remaining']) {
            limit = Math.min(limit, parseInt(files.meta['x-ratelimit-remaining'], 10));
          }
          if (err) {
            lifecycle.release(cacheStr);
            return onDone(err, []);
          }

          var names = [];
          files.forEach(function(file) {
            names.push(file.name);

            var slashPath = file.path.charAt(0) === '/' ? file.path : '/' + file.path;
            cache.http[slashPath] = file;
            cache.stat[slashPath] = {
              size: file.size,
              isFile: function() {
                return file.type === 'file';
              },
              isDirectory: function() {
                return file.type === 'dir';
              },
            };
          });
          cache.readdir[cacheStr] = names;
          lifecycle.release(cacheStr);
          return onDone(null, names);
        });
      },
    },
  }, function(err, results) {
    if (onDone) {
      var cacheEntries = [];
      if (results) {
        cacheEntries = results.map(function(path) {
          return cache.http[path.charAt(0) === '/' ? path : '/' + path];
        });
      }
      return onDone(err, cacheEntries, {
        limit: limit,
        cacheHits: cacheHits,
        apiCalls: apiCalls,
      });
    }
  });
};
