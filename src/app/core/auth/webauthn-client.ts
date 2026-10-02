import { DOCUMENT, Injectable, inject } from '@angular/core';
import { PasskeyAssertion, PasskeyRequest } from './auth.model';

/** Why a passkey prompt produced no assertion. The browser does not say which, so the UI treats both alike. */
export class PasskeyPromptError extends Error {
  constructor(readonly reason: 'cancelled' | 'failed') {
    super(`Passkey prompt ${reason}`);
  }
}

/**
 * The one place that talks to the browser's WebAuthn API (docs/ARCHITECTURE.md §11). The browser or the operating
 * system draws the prompt; Admin never imitates it. Rejects with `PasskeyPromptError`.
 */
export abstract class WebAuthnClient {
  abstract get(request: PasskeyRequest): Promise<PasskeyAssertion>;
}

/**
 * The real client. Written for the HTTP adapter; not exercised yet: demo builds bind the simulated one, and production
 * builds have no sign-in in this slice, so it has never run against an authenticator.
 */
@Injectable()
export class BrowserWebAuthnClient extends WebAuthnClient {
  private readonly credentials = inject(DOCUMENT).defaultView?.navigator.credentials;

  async get(request: PasskeyRequest): Promise<PasskeyAssertion> {
    if (!this.credentials) throw new PasskeyPromptError('failed');
    try {
      const credential = await this.credentials.get({ publicKey: request.publicKey });
      if (credential === null) throw new PasskeyPromptError('cancelled');
      return { credential };
    } catch (error: unknown) {
      if (error instanceof PasskeyPromptError) throw error;
      // NotAllowedError covers both a dismissed prompt and a timeout (WebAuthn §5.1.4.1).
      const cancelled = error instanceof DOMException && error.name === 'NotAllowedError';
      throw new PasskeyPromptError(cancelled ? 'cancelled' : 'failed');
    }
  }
}
