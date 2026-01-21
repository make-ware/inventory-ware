import { describe, it, expect } from 'vitest';
import { UserSchema, LoginSchema, RegisterSchema } from '../index.js';

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
