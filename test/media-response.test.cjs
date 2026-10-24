const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { mediaResponse } = require('../src/main/media-response.cjs');
const file = path.join(__dirname,'fixtures/sample.mp4');
const request = (range,method='GET') => new Request('https://local.test/clip',{method,headers:range?{Range:range}:{}});

test('local video advertises seekable bytes and serves full media and HEAD metadata', async () => {
  const bytes = await fs.readFile(file), response = await mediaResponse(file,request());
  assert.equal(response.status,200); assert.equal(response.headers.get('accept-ranges'),'bytes');
  assert.equal(response.headers.get('content-type'),'video/mp4');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  const head = await mediaResponse(file,request(null,'HEAD'));
  assert.equal(head.headers.get('content-length'),String(bytes.length)); assert.equal(await head.text(),'');
});

test('reverse seeks can read arbitrary, open-ended and suffix byte ranges', async () => {
  const bytes = await fs.readFile(file);
  for(const [range,start,end] of [['bytes=32-63',32,63],['bytes=99000-',99000,bytes.length-1],['bytes=-16',bytes.length-16,bytes.length-1],['bytes=99000-999999',99000,bytes.length-1]]) {
    const response = await mediaResponse(file,request(range));
    assert.equal(response.status,206); assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(start,end+1));
  }
  for(const range of ['bytes=999999-','bytes=4-2','bytes=-0','bytes=-','bytes=0-1,4-5','invalid']) {
    const response = await mediaResponse(file,request(range));
    assert.equal(response.status,416); assert.equal(response.headers.get('content-range'),`bytes */${bytes.length}`);
  }
});
