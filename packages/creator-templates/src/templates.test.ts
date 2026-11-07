import { describe, expect, it } from 'vitest';

import { templates } from './index';

describe('creator templates', () => {
  it('declare the dimension their document uses', () => {
    for (const template of templates) {
      expect(template.document.dimension, template.id).toBe(template.dimension);
    }
  });

  it('have unique ids', () => {
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  });
});
