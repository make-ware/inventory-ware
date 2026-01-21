// Shared enums for the project

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum CollectionName {
  USERS = 'users',
  POSTS = 'posts',
  COMMENTS = 'comments',
}

// PocketBase collection names (type-safe)
export const COLLECTIONS = {
  USERS: 'users',
  POSTS: 'posts',
  COMMENTS: 'comments',
} as const;

export type CollectionNameType = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
