import { CliError, EXIT } from './errors.js';

export interface AnalysisResponse {
  success: boolean;
  image?: unknown;
  items?: unknown[];
  container?: unknown;
}

/**
 * Thin client for the webapp's Next.js route handlers.
 *
 * The AI vision pipeline lives in `@project/webapp` (it needs an AI provider
 * key and the server-only PocketBase client), so the CLI drives it over HTTP with
 * the same bearer token it uses for PocketBase - exactly like the webapp's own
 * upload flow does.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string
  ) {}

  private async request<T>(path: string, body: unknown): Promise<T> {
    const token = this.getToken();
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new CliError(
        `Could not reach the Inventory Ware API at ${this.baseUrl}.`,
        EXIT.API,
        `Is the webapp running, and does --url / APP_URL point at it? (${
          error instanceof Error ? error.message : String(error)
        })`
      );
    }

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        // Response had no JSON body; keep the status line.
      }
      if (response.status === 401 || response.status === 403) {
        throw new CliError(message, EXIT.AUTH, 'Run `iw login` to sign in.');
      }
      throw new CliError(message, EXIT.API);
    }

    return (await response.json()) as T;
  }

  /** Analyze an already-uploaded image. */
  analyzeImage(imageId: string): Promise<AnalysisResponse> {
    return this.request<AnalysisResponse>('/api-next/analyze-image', {
      imageId,
    });
  }
}
