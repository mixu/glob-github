var glob = require('../');

glob({
  user: 'jekyll',
  repo: 'jekyll',
  branch: 'gh-pages',
  glob: '/*.txt',
  authenticate: {
    type: 'oauth',
    token: 'SOME TOKEN'
  }
}, function(err, results, meta) {
  console.log(err, results, meta);
});
