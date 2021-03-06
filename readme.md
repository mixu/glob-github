# glob-github

Run glob expressions against the Github Repo Contents API and return the matching files and metadata; with caching.

## Features

- you can avoid performing a full git clone if you use [the Github Contents API](https://developer.github.com/v3/repos/contents/) to fetch files, but using it to traverse individual file paths is tedious; why not just run a glob expression against a specific Github repository and get the resulting API results?
- you can use any glob expression like `**/*.md` to match files
- supports in-memory caching so that the same file paths are never requested multiple times; you can easily write the cache to disk as a JSON file if you want long term caching as it is a simple hash
- (since v1.1.0) deduplicates ongoing requests, so that even when executing multiple globs at the same time only one HTTP request is made for each resource

## Installation

```
npm install --save glob-github
```

## Usage

Here's a quick example:

```
var glob = require('glob-github');

glob({
  user: 'mixu',
  repo: 'singlepageappbook',
  glob: '**/*.md',
  authenticate: {
    type: 'oauth',
    token: '<AUTH TOKEN HERE>'
  }
}, function(err, results, meta) {
  console.log(err, results, meta);
  // results is an array of Github Get Contents API call results:
  // [ { type: 'file', name: 'index.md', path: 'input/index.md', ... }]
  // meta:
  // { limit: 4774, cacheHits: 0, apiCalls: 16 }
});
```

`glob(opts, onDone)`, where `opts` is an options hash containing:

- `opts.user`: Github username
- `opts.repo`: Github repo
- `opts.branch`: Github branch (since `v1.2.0`); defaults to master
- `opts.glob`: glob expression to match against
- `opts.authenticate`: a hash passed to [`node-github`](https://github.com/mikedeboer/node-github#authentication)
- `opts.cache`: (Optional). A hash that can be reused across calls, pass in a `{}` on the first usage and keep passing the same hash in every time to keep using the cache. Note that the results are automatically cached so you only need to pass this if you want to, say, write the cache to disk or something.
- `opts.github`: (Optional). An instance of [`node-github`](https://github.com/mikedeboer/node-github) that you have configured to your liking.

The `onDone(err, results, meta)` callback receives three arguments:

- `err`: an error, if any
- `results`: an array of results which match the given glob expression as returned from [the Github Get Contents API](https://developer.github.com/v3/repos/contents/#get-contents); see the link for examples.
- `meta`: an object containing metadata:
  - `meta.limit`: the smallest Github API `x-rate-limit` header value that has been received
  - `meta.cacheHits`: the number of Github API calls that were fulfilled from the cache to resolve the glob expression
  - `meta.githubAPI`: the number of Github API calls that were made to resolve the glob expression

## Caching

If you make the same call (or another glob expression resolution) against the same repo, `glob-github` will attempt to fulfill matches from the cache:

```
var glob = require('glob-github');
var config = {
  user: 'mixu',
  repo: 'singlepageappbook',
  glob: '**/*.md',
  authenticate: {
    type: 'oauth',
    token: '<AUTH TOKEN HERE>'
  }
};

glob(config, function(err, results, meta) {
  // should show some number of meta.githubAPI
  console.log(meta);
  glob(config, function(err, results, meta) {
    // should be fulfilled completely from the cache!
    console.log(meta);
  });
});
```

## Deduplication

Concurrent calls are deduplicated: if a request for a specific Github endpoint (e.g. username + repo + path combination) is already pending, then any concurrent requests simply wait for that request to complete rather than making a new request.

```
var glob = require('glob-github');
var config = { ... };

glob(config, function(err, results, meta) {
  console.log(err, results.length, meta);
});

glob(config, function(err, results, meta) {
  console.log(err, results.length, meta);
});
```

You should see something like:

```
null 16 { limit: 10, cacheHits: 10, apiCalls: 6 }
null 16 { limit: 10, cacheHits: 6, apiCalls: 10 }
```

Note how the 16 API calls needed to resolve this `**/*.md` glob are divided between the two concurrent `glob()` calls so that only 16 requests are made and the duplicate requests are served from the cache.
