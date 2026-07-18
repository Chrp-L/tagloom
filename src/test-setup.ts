import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) { this.callback = callback; }
  observe(target: Element) {
    const contentRect = DOMRect.fromRect({ width: 900, height: 600 });
    this.callback([{ target, contentRect, borderBoxSize: [{ inlineSize: 900, blockSize: 600 }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverMock });
Object.defineProperty(globalThis, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });

class PointerEventMock extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
    this.isPrimary = init.isPrimary ?? true;
  }
}

if (!("PointerEvent" in globalThis)) Object.defineProperty(globalThis, "PointerEvent", { value: PointerEventMock });
