'use strict';

const common = require('../common');
if (!common.hasCrypto) {
  common.skip('missing crypto');
  return;
}

const assert = require('assert');
const crypto = require('crypto');
const dgram = require('dgram');
const dns = require('dns');
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const zlib = require('zlib');
const http2 = require('http2');
const ChildProcess = require('child_process').ChildProcess;
const StreamWrap = require('_stream_wrap').StreamWrap;
const HTTPParser = process.binding('http_parser').HTTPParser;
const async_wrap = process.binding('async_wrap');
const pkeys = Object.keys(async_wrap.Providers);

let keyList = pkeys.slice();
// Drop NONE
keyList.splice(0, 1);

// fs-watch currently needs special configuration on AIX and we
// want to improve under https://github.com/nodejs/node/issues/5085.
// strip out fs watch related parts for now
if (common.isAix) {
  for (let i = 0; i < keyList.length; i++) {
    if ((keyList[i] === 'FSEVENTWRAP') || (keyList[i] === 'STATWATCHER')) {
      keyList.splice(i, 1);
    }
  }
}

function init(id, provider) {
  keyList = keyList.filter((e) => e !== pkeys[provider]);
}

async_wrap.setupHooks({ init });

async_wrap.enable();


setTimeout(common.noop, 1);

fs.stat(__filename, common.noop);

if (!common.isAix) {
  // fs-watch currently needs special configuration on AIX and we
  // want to improve under https://github.com/nodejs/node/issues/5085.
  // strip out fs watch related parts for now
  fs.watchFile(__filename, common.noop);
  fs.unwatchFile(__filename);
  fs.watch(__filename).close();
}

dns.lookup('localhost', common.noop);
dns.lookupService('::', 0, common.noop);
dns.resolve('localhost', common.noop);

new StreamWrap(new net.Socket());

new (process.binding('tty_wrap').TTY)();

crypto.randomBytes(1, common.noop);

common.refreshTmpDir();

net.createServer(function(c) {
  c.end();
  this.close();
}).listen(common.PIPE, function() {
  net.connect(common.PIPE, common.noop);
});

net.createServer(function(c) {
  c.end();
  this.close(checkTLS);
}).listen(0, function() {
  net.connect(this.address().port, common.noop);
});

dgram.createSocket('udp4').bind(0, function() {
  this.send(Buffer.allocUnsafe(2), 0, 2, this.address().port, '::', () => {
    this.close();
  });
});

process.on('SIGINT', () => process.exit());

// Run from closed net server above.
function checkTLS() {
  const options = {
    key: fs.readFileSync(common.fixturesDir + '/keys/ec-key.pem'),
    cert: fs.readFileSync(common.fixturesDir + '/keys/ec-cert.pem')
  };
  const server = tls.createServer(options, common.noop)
    .listen(0, function() {
      const connectOpts = { rejectUnauthorized: false };
      tls.connect(this.address().port, connectOpts, function() {
        this.destroy();
        server.close();
      });
    });
}

zlib.createGzip();

new ChildProcess();

new HTTPParser(HTTPParser.REQUEST);

{
  const server = http2.createServer();
  server.on('stream', common.mustCall((stream) => {
    stream.respond({ ':status': 200 });
    stream.end('hello world');
  }));
  server.listen(0, common.mustCall(() => {
    const client = http2.connect(`http://localhost:${server.address().port}`);
    const req = client.request({ ':path': '/' });
    req.on('response', common.mustCall());
    req.on('data', common.noop);
    req.on('end', common.mustCall(() => {
      server.close();
      client.shutdown(common.mustCall(() => client.destroy()));
    }));
    req.end();
  }));
}


process.on('exit', function() {
  if (keyList.length !== 0) {
    process._rawDebug('Not all keys have been used:');
    process._rawDebug(keyList);
    assert.strictEqual(keyList.length, 0);
  }
});
