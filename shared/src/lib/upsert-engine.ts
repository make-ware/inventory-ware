/**
 * Upsert Engine for Container Image Upload
 *
 * This module implements the matching logic for container image upsert operations.
 * It matches AI-detected items against existing container items using category-based
 * matching (not system UIDs) and performs intelligent upsert operations.
 *
 * Feature: image-upload-upsert
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import type { ItemMetadata } from '../types/metadata.js';
import type { ItemsResponse } from '../pocketbase-types.js';

/**
 * Result of matching AI-detected items against existing items
 */
export interface MatchResult {
  /** Successfully matched pairs with their scores */
  matched: Array<{
    existingItem: ItemsResponse;
    detectedItem: ItemMetadata;
    score: number;
  }>;
  /** AI-detected items that didn't match any existing items (below threshold) */
  newItems: ItemMetadata[];
  /** Existing items that weren't matched by any AI-detected items */
  unmatchedExisting: ItemsResponse[];
}

/**
 * Result of executing an upsert operation
 */
export interface UpsertResult {
  /** Items that were updated with new AI metadata */
  updatedItems: ItemsResponse[];
  /** New items that were created */
  createdItems: ItemsResponse[];
  /** Existing items that weren't found in the new image */
  unmatchedExisting: ItemsResponse[];
}

/**
 * Configuration for the upsert engine
 */
export interface UpsertEngineConfig {
  /**
   * Minimum score threshold for considering a match valid.
   * Items with scores below this threshold are classified as new.
   * Default: 0.4
   */
  matchThreshold: number;
}

/**
 * Default configuration for the upsert engine
 */
export const DEFAULT_CONFIG: UpsertEngineConfig = {
  matchThreshold: 0.4,
};

/**
 * Compute string similarity using normalized Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Similarity score between 0 and 1
 */
function computeStringSimilarity(str1: string, str2: string): number {
  // Normalize strings: lowercase and trim
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Handle empty strings
  if (s1.length === 0 && s2.length === 0) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Check for substring match (gives partial credit)
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = Math.min(s1.length, s2.length);
    const longer = Math.max(s1.length, s2.length);
    return shorter / longer;
  }

  // Compute Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);

  // Normalize to 0-1 range (1 = identical, 0 = completely different)
  return 1 - distance / maxLength;
}

/**
 * Compute match score between an AI-detected item and an existing item.
 *
 * Score computation:
 * - categoryFunctional exact match: +0.30
 * - categorySpecific exact match:   +0.30
 * - itemType exact match:           +0.25
 * - itemLabel similarity:           +0.15 (normalized Levenshtein)
 *
 * Total possible score: 1.0
 *
 * Feature: image-upload-upsert
 * Validates: Requirements 2.1, 2.2, 2.3
 *
 * @param detected - AI-detected item metadata
 * @param existing - Existing item from database
 * @returns Match score between 0 and 1
 */
export function computeMatchScore(
  detected: ItemMetadata,
  existing: ItemsResponse
): number {
  let score = 0.0;

  // Category functional match: +0.30
  if (
    detected.categoryFunctional.toLowerCase().trim() ===
    existing.categoryFunctional.toLowerCase().trim()
  ) {
    score += 0.3;
  }

  // Category specific match: +0.30
  if (
    detected.categorySpecific.toLowerCase().trim() ===
    existing.categorySpecific.toLowerCase().trim()
  ) {
    score += 0.3;
  }

  // Item type match: +0.25
  if (
    detected.itemType.toLowerCase().trim() ===
    existing.itemType.toLowerCase().trim()
  ) {
    score += 0.25;
  }

  // Item label similarity: +0.15 (weighted by similarity)
  const labelSimilarity = computeStringSimilarity(
    detected.itemLabel,
    existing.itemLabel
  );
  score += labelSimilarity * 0.15;

  return score;
}

/**
 * Match AI-detected items against existing container items using greedy assignment.
 *
 * Algorithm:
 * 1. Compute match scores for all (detected, existing) pairs
 * 2. Sort pairs by descending score
 * 3. For ties, prefer lower existing item index (order position)
 * 4. Greedily assign pairs ensuring one-to-one matching
 * 5. Classify unassigned detected items as new if their best score < threshold
 *
 * Feature: image-upload-upsert
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 *
 * @param detectedItems - Items detected by AI in the new image
 * @param existingItems - Items currently in the container
 * @param config - Configuration including match threshold
 * @returns Match result with matched pairs, new items, and unmatched existing items
 */
export function matchItems(
  detectedItems: ItemMetadata[],
  existingItems: ItemsResponse[],
  config: UpsertEngineConfig = DEFAULT_CONFIG
): MatchResult {
  // Handle edge cases
  if (detectedItems.length === 0) {
    return {
      matched: [],
      newItems: [],
      unmatchedExisting: [...existingItems],
    };
  }

  if (existingItems.length === 0) {
    return {
      matched: [],
      newItems: [...detectedItems],
      unmatchedExisting: [],
    };
  }

  // Compute all match scores with indices for tiebreaking
  interface ScoredPair {
    detectedIndex: number;
    existingIndex: number;
    detected: ItemMetadata;
    existing: ItemsResponse;
    score: number;
  }

  const scoredPairs: ScoredPair[] = [];
  for (let di = 0; di < detectedItems.length; di++) {
    for (let ei = 0; ei < existingItems.length; ei++) {
      const score = computeMatchScore(detectedItems[di], existingItems[ei]);
      scoredPairs.push({
        detectedIndex: di,
        existingIndex: ei,
        detected: detectedItems[di],
        existing: existingItems[ei],
        score,
      });
    }
  }

  // Sort by descending score, with existing item index as tiebreaker
  // (lower index wins in case of tie)
  scoredPairs.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score; // Higher score first
    }
    return a.existingIndex - b.existingIndex; // Lower index first (tiebreaker)
  });

  // Greedy one-to-one assignment
  const matchedDetectedIndices = new Set<number>();
  const matchedExistingIndices = new Set<number>();
  const matched: MatchResult['matched'] = [];

  for (const pair of scoredPairs) {
    // Skip if either item is already matched
    if (
      matchedDetectedIndices.has(pair.detectedIndex) ||
      matchedExistingIndices.has(pair.existingIndex)
    ) {
      continue;
    }

    // Check if score meets threshold
    if (pair.score >= config.matchThreshold) {
      matched.push({
        existingItem: pair.existing,
        detectedItem: pair.detected,
        score: pair.score,
      });
      matchedDetectedIndices.add(pair.detectedIndex);
      matchedExistingIndices.add(pair.existingIndex);
    }
  }

  // Collect unmatched detected items (new items)
  const newItems: ItemMetadata[] = [];
  for (let i = 0; i < detectedItems.length; i++) {
    if (!matchedDetectedIndices.has(i)) {
      newItems.push(detectedItems[i]);
    }
  }

  // Collect unmatched existing items
  const unmatchedExisting: ItemsResponse[] = [];
  for (let i = 0; i < existingItems.length; i++) {
    if (!matchedExistingIndices.has(i)) {
      unmatchedExisting.push(existingItems[i]);
    }
  }

  return {
    matched,
    newItems,
    unmatchedExisting,
  };
}

/**
 * Execute upsert operations based on match results.
 *
 * This function takes the match result and executes the actual database operations
 * by calling the provided callbacks for creating and updating items.
 *
 * Feature: image-upload-upsert
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * @param matchResult - Result from matchItems containing matched pairs, new items, and unmatched existing
 * @param newImageId - ID of the newly uploaded image
 * @param containerId - ID of the container being updated
 * @param callbacks - Callbacks for creating and updating items
 * @returns Upsert result with updated items, created items, and unmatched existing items
 */
export async function executeUpsert(
  matchResult: MatchResult,
  newImageId: string,
  containerId: string,
  callbacks: {
    updateItem: (
      itemId: string,
      metadata: ItemMetadata,
      imageId: string
    ) => Promise<ItemsResponse>;
    createItem: (
      metadata: ItemMetadata,
      containerId: string,
      imageId: string
    ) => Promise<ItemsResponse>;
  }
): Promise<UpsertResult> {
  const updatedItems: ItemsResponse[] = [];
  const createdItems: ItemsResponse[] = [];

  // Update matched items with AI metadata and new ImageRef
  for (const match of matchResult.matched) {
    const updated = await callbacks.updateItem(
      match.existingItem.id,
      match.detectedItem,
      newImageId
    );
    updatedItems.push(updated);
  }

  // Create new items with AI metadata, ContainerRef, and ImageRef
  for (const newItem of matchResult.newItems) {
    const created = await callbacks.createItem(
      newItem,
      containerId,
      newImageId
    );
    createdItems.push(created);
  }

  // Unmatched existing items are left unchanged
  const unmatchedExisting = matchResult.unmatchedExisting;

  return {
    updatedItems,
    createdItems,
    unmatchedExisting,
  };
}
