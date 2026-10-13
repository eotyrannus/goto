import { describe, expect, it } from 'vitest';
import { findIssues } from './clashes';
import { templates } from './templates';

describe('templates', () => {
  it.each(templates.map((t) => [t.name, t] as const))('%s starts without clashes', (_, t) => {
    const issues = findIssues(t.build());
    expect(Object.fromEntries([...issues].map(([id, s]) => [id, [...s]]))).toEqual({});
  });
});
