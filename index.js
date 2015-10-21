var wildglob = require('wildglob');
var GitHubApi = require('github');
var github = new GitHubApi({
  version: '3.0.0'
});

var sharedCache = {};

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
  if (!cache.stat['/']) {
    cache.stat['/'] = {
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

  wildglob(opts.glob, {
    cwd: '/',
    fs: {
      stat: function(path, onDone) {
        process.nextTick(function() {
          return onDone(null, cache.stat[path]);
        });
      },
      readdir: function(path, onDone) {
        var fetchOpts = {
          user: opts.user,
          repo: opts.repo,
          path: path.replace(/^\//, '').replace(/\/$/, '') || ''
        };
        var cacheStr = toCacheStr(fetchOpts);

        if (cache.readdir[cacheStr]) {
          process.nextTick(function() {
            cacheHits++;
            onDone(null, cache.readdir[cacheStr]);
          });
          return;
        }

        apiCalls++;
        github.repos.getContent(fetchOpts, function(err, files) {
          // update rate limit
          if (files && files.meta['x-ratelimit-remaining']) {
            limit = Math.min(limit, parseInt(files.meta['x-ratelimit-remaining'], 10));
          }
          if (err) {
            return onDone(err, []);
          }

          var names = [];
          files.forEach(function(file) {
            names.push(file.name);

            cache.http[file.path] = file;
            cache.stat['/' + file.path] = {
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
          return onDone(null, names);
        });
      },
    },
  }, function(err, results) {
    if (onDone) {
      return onDone(err, results.map(function(path) {
        return cache.http[path];
      }), {
        limit: limit,
        cacheHits: cacheHits,
        apiCalls: apiCalls,
      });
    }
  });
};
