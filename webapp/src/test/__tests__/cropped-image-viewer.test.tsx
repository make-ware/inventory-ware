import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CroppedImageViewer } from '@/components/image/cropped-image-viewer';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe(target: any) {}
  unobserve() {}
  disconnect() {}
} as any;

describe('CroppedImageViewer Performance', () => {
  let originalImage: any;
  let imageConstructorSpy: any;

  // Store original getters to restore them
  const originalClientWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth'
  );
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight'
  );

  beforeEach(() => {
    originalImage = global.Image;
    imageConstructorSpy = vi.fn();

    // Mock Image constructor to verify it is NOT called
    class MockImage {
      onload: any = null;
      _src: string = '';
      naturalWidth: number = 100;
      naturalHeight: number = 100;

      constructor() {
        imageConstructorSpy();
      }

      set src(value: string) {
        this._src = value;
      }

      get src() {
        return this._src;
      }
    }

    global.Image = MockImage as any;

    // Mock dimensions for container
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 500,
    });
  });

  afterEach(() => {
    global.Image = originalImage;
    vi.restoreAllMocks();

    if (originalClientWidth)
      Object.defineProperty(
        HTMLElement.prototype,
        'clientWidth',
        originalClientWidth
      );
    if (originalClientHeight)
      Object.defineProperty(
        HTMLElement.prototype,
        'clientHeight',
        originalClientHeight
      );
  });

  it('verifies redundant Image object creation is REMOVED (Optimization)', () => {
    render(
      <CroppedImageViewer
        imageUrl="/test-image.jpg"
        boundingBox={{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }}
        mode="highlight"
      />
    );

    // Optimization check: Image constructor should NOT be called anymore
    expect(imageConstructorSpy).not.toHaveBeenCalled();
  });

  it('verifies bounding box renders when dimensions are loaded (Correctness)', async () => {
    const { container } = render(
      <CroppedImageViewer
        imageUrl="/test-image.jpg"
        boundingBox={{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }}
        mode="highlight"
      />
    );

    // Find the rendered image
    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    if (img) {
      // Mock natural dimensions on the img element
      // We use Object.defineProperty because usually naturalWidth is read-only
      Object.defineProperty(img, 'naturalWidth', {
        configurable: true,
        value: 800,
      });
      Object.defineProperty(img, 'naturalHeight', {
        configurable: true,
        value: 600,
      });

      // Trigger the load event which calls our new handleImageLoad
      fireEvent.load(img);
    }

    // Wait for state update
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const bbox = container.querySelector('.border-primary');
    expect(bbox).not.toBeNull();
  });
});
