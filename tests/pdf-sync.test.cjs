'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/pdfSync.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { dragRect, toSyncPoint, toViewportRect, mergeTextRects, sampleRegion } = context.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('PDF reverse drag normalizes every direction', () => {
  assert.deepEqual(plain(dragRect({ x: 80, y: 120 }, { x: 20, y: 30 })), { x: 20, y: 30, width: 60, height: 90 });
});

test('PDF sync coordinates round trip under zoom, crop offsets and page rotation', () => {
  for (const scale of [0.35, 0.9, 1.8]) {
    for (const rotation of [0, 90, 180, 270]) {
      const box = [10, 20, 610, 820];
      const viewport = {
        viewBox: box,
        convertToViewportPoint(x, y) {
          const u = x - box[0], v = box[3] - y;
          const [a, b] = rotation === 90 ? [800 - v, u] : rotation === 180 ? [600 - u, 800 - v] : rotation === 270 ? [v, 600 - u] : [u, v];
          return [a * scale, b * scale];
        },
        convertToPdfPoint(x, y) {
          const a = x / scale, b = y / scale;
          const [u, v] = rotation === 90 ? [b, 800 - a] : rotation === 180 ? [600 - a, 800 - b] : rotation === 270 ? [600 - b, a] : [a, b];
          return [u + box[0], box[3] - v];
        },
      };
      const point = { x: 123, y: 456 };
      const [x, y] = viewport.convertToViewportPoint(point.x + box[0], box[3] - point.y);
      const actual = toSyncPoint({ x, y }, viewport);
      assert.ok(Math.abs(actual.x - point.x) < 1e-8 && Math.abs(actual.y - point.y) < 1e-8);
      const rect = toViewportRect({ x: 30, y: 60, width: 200, height: 12 }, viewport);
      assert.ok(Math.abs(rect.width - (rotation % 180 ? 12 : 200) * scale) < 1e-8);
      assert.ok(Math.abs(rect.height - (rotation % 180 ? 200 : 12) * scale) < 1e-8);
    }
  }
});

test('PDF automatic boxes preserve separate columns and sample actual text lines', () => {
  const rects = [{ x: 20, y: 30, width: 50, height: 10 }, { x: 73, y: 31, width: 50, height: 10 }, { x: 300, y: 30, width: 50, height: 10 }];
  assert.deepEqual(plain(mergeTextRects(rects)), [{ x: 20, y: 30, width: 103, height: 11 }, { x: 300, y: 30, width: 50, height: 10 }]);
  const lines = Array.from({ length: 50 }, (_, i) => ({ x: 20, y: i * 14, width: 100, height: 10 }));
  const points = sampleRegion(lines, { x: 0, y: 0, width: 300, height: 800 });
  assert.equal(points.length, 7);
  assert.equal(points[0].y, 5);
  assert.equal(points.at(-1).y, 49 * 14 + 5);
  assert.deepEqual(plain(sampleRegion([], { x: 10, y: 20, width: 80, height: 40 })), [{ x: 50, y: 40 }]);
});
