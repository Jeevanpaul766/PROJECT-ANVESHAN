import { mock, test } from 'node:test';
import * as fs from 'node:fs';

test('mock', () => {
  mock.method(fs, 'readFileSync', () => 'mocked');
  console.log(fs.readFileSync('test.txt'));
});
