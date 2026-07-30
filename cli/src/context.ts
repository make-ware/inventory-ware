import PocketBase from 'pocketbase';
import {
  ContainerMutator,
  ImageMutator,
  ItemMutator,
  type TypedPocketBase,
} from '@project/shared';
import { ApiClient } from './api-client.js';
import { createFileAuthStore } from './auth-store.js';
import {
  authPath,
  resolveConfig,
  type CliConfig,
  type GlobalFlags,
} from './config.js';
import { notLoggedIn } from './errors.js';

export interface Context {
  pb: TypedPocketBase;
  config: CliConfig;
  items: ItemMutator;
  containers: ContainerMutator;
  images: ImageMutator;
  api: ApiClient;
}

export async function createContext(flags: GlobalFlags): Promise<Context> {
  const config = await resolveConfig(flags);
  const store = await createFileAuthStore(authPath());

  const pb = new PocketBase(config.pocketbaseUrl, store) as TypedPocketBase;
  // The CLI issues sequential requests; auto-cancellation would abort them.
  pb.autoCancellation(false);

  return {
    pb,
    config,
    items: new ItemMutator(pb),
    containers: new ContainerMutator(pb),
    images: new ImageMutator(pb),
    api: new ApiClient(config.apiUrl, () => pb.authStore.token),
  };
}

/**
 * Returns the authenticated user's id, or throws if there is no valid session.
 *
 * Every collection is scoped to `UserRef = @request.auth.id` server-side, and
 * `UserRef` is a required field on create, so commands need this explicitly.
 */
export function requireUserId(ctx: Context): string {
  const id = ctx.pb.authStore.record?.id;
  if (!ctx.pb.authStore.isValid || !id) throw notLoggedIn();
  return id;
}
