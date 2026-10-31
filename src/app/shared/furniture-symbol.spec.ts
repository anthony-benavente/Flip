import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FurnitureShape } from '../model/catalog';
import { symbolParts } from '../model/furniture-symbols';
import { FurnitureSymbol } from './furniture-symbol';

@Component({
  imports: [FurnitureSymbol],
  template: `<svg><g appFurnitureSymbol [shape]="shape()" [width]="200" [depth]="90" color="#808080" /></svg>`,
})
class Host {
  readonly shape = signal<FurnitureShape>('sofa');
}

describe('FurnitureSymbol', () => {
  const render = (shape: FurnitureShape) => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.shape.set(shape);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

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
