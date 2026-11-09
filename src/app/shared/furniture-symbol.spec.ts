import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FurnitureShape } from '../model/catalog';
import { symbolParts } from '../model/furniture-symbols';
import { FurnitureSymbol } from './furniture-symbol';

@Component({
  imports: [FurnitureSymbol],
  template: `<svg><g appFurnitureSymbol [shape]="shape()" [width]="200" [depth]="90" color="#808080" [topView]="topView()" /></svg>`,
})
class Host {
  readonly shape = signal<FurnitureShape>('sofa');
  readonly topView = signal<string | undefined>(undefined);
}

describe('FurnitureSymbol', () => {
  const render = (shape: FurnitureShape, topView?: string) => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.shape.set(shape);
    fixture.componentInstance.topView.set(topView);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('stretches a model top view over the box instead of drawing the symbol parts', () => {
    const el = render('sofa', 'blob:top');
    const image = el.querySelector('image.top-view')!;
    expect(image.getAttribute('href')).toBe('blob:top');
    expect([image.getAttribute('x'), image.getAttribute('y'), image.getAttribute('width'), image.getAttribute('height')]).toEqual(['-100', '-45', '200', '90']);
    expect(image.getAttribute('preserveAspectRatio')).toBe('none');
    expect(el.querySelectorAll('.part')).toHaveLength(0);
    expect(el.querySelector('.base')!.classList).toContain('faint');
    expect(render('sofa').querySelector('image')).toBeNull();
  });

  it('draws a rectangular base plus one element per symbol part, in the SVG namespace', () => {
    const el = render('sofa');
    const base = el.querySelector('.base')!;
    expect(base.tagName).toBe('rect');
    expect(base.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(base.getAttribute('width')).toBe('200');
    expect(base.getAttribute('fill')).toBe('#808080');
    expect(el.querySelectorAll('.part')).toHaveLength(symbolParts('sofa', 200, 90).length);
  });

  it('shades parts from the item color and outlines with a darker stroke', () => {
    const el = render('sofa');
    const part = el.querySelector('rect.part')!;
    expect(part.getAttribute('fill')).not.toBe('#808080');
    expect(el.querySelector('.base')!.getAttribute('stroke')).toBe('#464646');
  });

  it('draws round shapes as an ellipse', () => {
    const el = render('round-table');
    expect(el.querySelector('.base')!.tagName).toBe('ellipse');
    expect(el.querySelector('.base')!.getAttribute('rx')).toBe('100');
  });
});
