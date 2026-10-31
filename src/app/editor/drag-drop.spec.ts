import { decodeFurnitureDrag, encodeFurnitureDrag } from './drag-drop';

describe('furniture drag data', () => {
  it('round-trips catalog items with and without an uploaded model', () => {
    expect(encodeFurnitureDrag({ catalogId: 'desk' })).toBe('desk');
    expect(decodeFurnitureDrag('desk')).toEqual({ catalogId: 'desk' });
    const variant = { catalogId: 'office-chair', modelId: 'm_abc' };
    expect(encodeFurnitureDrag(variant)).toBe('office-chair#m_abc');
    expect(decodeFurnitureDrag(encodeFurnitureDrag(variant))).toEqual(variant);
  });
});
