import { mock, test } from 'node:test';
import * as orchestrator from './src/engine/agents/orchestrator.js';

test('mock method', () => {
  mock.method(orchestrator, 'buildPlan', async () => { return { tasks: [] } });
});
