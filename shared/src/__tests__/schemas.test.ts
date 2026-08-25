import { describe, it, expect } from 'vitest';
import {
  UserSchema,
  LoginSchema,
  RegisterSchema,
  ItemInputSchema,
  ItemUpdateSchema,
  ContainerInputSchema,
  ContainerUpdateSchema,
} from '../index.js';

describe('User Schemas', () => {
  it('should validate a valid user object', () => {
    const validUser = {
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      collectionId: 'users',
      collectionName: 'users',
      expand: {},
    };

    const result = UserSchema.safeParse(validUser);
    if (!result.success) {
      console.log('Validation errors:', result.error.issues);
    }
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const invalidUser = {
      id: '123',
      email: 'invalid-email',
      password: 'password123',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      collectionId: 'users',
      collectionName: 'users',
      expand: {},
    };

    const result = UserSchema.safeParse(invalidUser);
    expect(result.success).toBe(false);
  });

  it('should validate login data', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123',
    };

    const result = LoginSchema.safeParse(loginData);
    expect(result.success).toBe(true);
  });

  it('should validate register data with matching passwords', () => {
    const registerData = {
      email: 'test@example.com',
      password: 'password123',
      passwordConfirm: 'password123',
      name: 'Test User',
    };

    const result = RegisterSchema.safeParse(registerData);
    expect(result.success).toBe(true);
  });
});

// Regression coverage for issue #57: the AI pipeline never writes boundingBox,
// so PocketBase returns `null` (not `undefined`) for that unset json column.
// Feeding such a record back into an update/create schema used to fail
// validation, and the edit forms had no render target for the error — so the
// Update button looked dead.
describe('PocketBase null json columns (issue #57)', () => {
  const itemBase = {
    itemLabel: 'Cordless Drill',
    categoryFunctional: 'Tools',
    categorySpecific: 'Power Tools',
    itemType: 'Drill',
  };

  it('ItemUpdateSchema accepts null boundingBox and itemAttributes', () => {
    const result = ItemUpdateSchema.safeParse({
      ...itemBase,
      boundingBox: null,
      itemAttributes: null,
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('boundingBox', null);
    expect(result.data?.boundingBox).toBeUndefined();
    expect(result.data?.itemAttributes).toBeUndefined();
  });

  it('ItemUpdateSchema accepts null relation refs', () => {
    const result = ItemUpdateSchema.safeParse({
      ...itemBase,
      ContainerRef: null,
      ImageRef: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.ContainerRef).toBeUndefined();
    expect(result.data?.ImageRef).toBeUndefined();
  });

  it('ItemUpdateSchema still preserves a real boundingBox', () => {
    const boundingBox = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const result = ItemUpdateSchema.safeParse({ ...itemBase, boundingBox });

    expect(result.success).toBe(true);
    expect(result.data?.boundingBox).toEqual(boundingBox);
  });

  it('ItemInputSchema accepts null json columns and keeps the [] default', () => {
    const result = ItemInputSchema.safeParse({
      ...itemBase,
      boundingBox: null,
      itemAttributes: null,
      ContainerRef: null,
      ImageRef: null,
      UserRef: 'user123',
    });

    expect(result.success).toBe(true);
    expect(result.data?.boundingBox).toBeUndefined();
    expect(result.data?.itemAttributes).toEqual([]);
  });

  it('ItemInputSchema still defaults itemAttributes when the key is absent', () => {
    const result = ItemInputSchema.safeParse({
      ...itemBase,
      UserRef: 'user123',
    });

    expect(result.success).toBe(true);
    expect(result.data?.itemAttributes).toEqual([]);
  });

  it('ContainerUpdateSchema accepts null boundingBox and ImageRef', () => {
    const result = ContainerUpdateSchema.safeParse({
      containerLabel: 'Tool Box A',
      boundingBox: null,
      ImageRef: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.boundingBox).toBeUndefined();
    expect(result.data?.ImageRef).toBeUndefined();
  });

  it('ContainerInputSchema accepts null boundingBox', () => {
    const result = ContainerInputSchema.safeParse({
      containerLabel: 'Tool Box A',
      boundingBox: null,
      UserRef: 'user123',
    });

    expect(result.success).toBe(true);
    expect(result.data?.boundingBox).toBeUndefined();
  });

  it('still rejects a malformed boundingBox', () => {
    const result = ItemUpdateSchema.safeParse({
      ...itemBase,
      boundingBox: { x: 'nope' },
    });

    expect(result.success).toBe(false);
  });
});
