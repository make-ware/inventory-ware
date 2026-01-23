// Services exports
export { AuthService, createAuthService } from './auth';
export {
  createAIAnalysisService,
  type AIAnalysisService,
  type CategoryLibrary,
} from './ai-analysis';
export { createInventoryService } from './inventory-client';
export type {
  InventoryService,
  ProcessImageResult,
} from './inventory-types';
