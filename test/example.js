var glob = require('../');

glob({
  user: 'mixu',
  repo: 'singlepageappbook',
  glob: '**/*.md'
}, function(err, results, meta) {
  console.log(err, results, meta);
});
