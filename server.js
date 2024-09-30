{
  "name": "cors-anywhere",
  "version": "0.4.4",
  "description": "CORS Anywhere is a reverse proxy which adds CORS headers to the proxied request. Request URL is taken from the path",
  "license": "MIT",
  "author": "Rob Wu <rob@robwu.nl>",
  "repository": {
    "type": "git",
    "url": "https://github.com/Rob--W/cors-anywhere.git"
  },
  "bugs": {
    "url": "https://github.com/Rob--W/cors-anywhere/issues/",
    "email": "rob@robwu.nl"
  },
  "keywords": [
    "cors",
    "cross-domain",
    "http-proxy",
    "proxy",
    "heroku"
  ],
  "main": "server.js", // **Changed from "./lib/cors-anywhere.js" to "server.js"**
  "files": [
    "lib/",
    "test/",
    "Procfile",
    "demo.html",
    "server.js"
  ],
  "scripts": {
    "start": "node server.js", // **Added start script**
    "lint": "eslint .",
    "test": "mocha ./test/test*.js --reporter spec",
    "test-coverage": "istanbul cover ./node_modules/.bin/_mocha -- test/test.js test/test-ratelimit.js --reporter spec"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "http-proxy": "1.11.1",
    "http-proxy-middleware": "^3.0.2",
    "node-fetch": "^2.7.0",
    "proxy-from-env": "0.0.1"
  },
  "devDependencies": {
    "coveralls": "^2.11.6",
    "eslint": "^2.2.0",
    "istanbul": "^0.4.2",
    "lolex": "^1.5.0",
    "mocha": "^3.4.2",
    "nock": "^8.2.1",
    "supertest": "^2.0.1"
  },
  "engines": {
    "node": ">=14.x" // **Consider updating to a newer Node.js version for better security and features**
  }
}
