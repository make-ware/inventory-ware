import { describe, it, expect } from 'vitest';
import { slugify } from '../utils/slugify.js';

describe('Metadata Helpers', () => {
  describe('slugify', () => {
    it('should preserve casing', () => {
      expect(slugify('Tools')).toBe('Tools');
    });

    it('should preserve spaces', () => {
      expect(slugify('Power Tools')).toBe('Power Tools');
    });

    it('should replace non-alphanumeric (except - and space) with hyphens', () => {
      expect(slugify('Electronics & Materials!')).toBe('Electronics Materials');
    });

    it('should replace slashes with hyphens', () => {
      expect(slugify('Sensors/Arduino')).toBe('Sensors-Arduino');
    });

    it('should remove leading/trailing separators', () => {
      expect(slugify(' -Tools- ')).toBe('Tools');
    });

    it('should compress multiple separators', () => {
      expect(slugify('Power   Tools')).toBe('Power Tools');
    });

    it('should handle numbers', () => {
      expect(slugify('Cat 123')).toBe('Cat 123');
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('should collapse multiple hyphens', () => {
      expect(slugify('Power---Tools')).toBe('Power-Tools');
    });

    it('should handle mixed separators', () => {
      expect(slugify('Power - Tools')).toBe('Power Tools');
    });
  });
});
