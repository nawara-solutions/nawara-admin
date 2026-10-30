import { ReceiptSecret } from './receipt-secret';

/**
 * The receipt secrets one financial intent holds, and their disposal (F1-S4; docs/design/f1-financial-authorization.md
 * §7.2 rule 3). The intent's owner (a later coordinator) discards them on cancellation, on any terminal outcome, when its page
 * is destroyed, and when the session changes (sign-out, another account, a revoked session). Discarding ends extraction; it
 * cannot erase a JavaScript string (receipt-secret.ts).
 */
export class ReceiptHolderScope {
  private readonly secrets = new Set<ReceiptSecret>();

  /** @param sessionKey the session the intent belongs to (`null`: none). */
  constructor(private readonly sessionKey: string | null) {}

  get size(): number {
    return this.secrets.size;
  }

  /** Holds a secret for this intent until it is released or discarded. */
  track(secret: ReceiptSecret): ReceiptSecret {
    this.secrets.add(secret);
    return secret;
  }

  /** Discards one secret (its intent reached a terminal outcome). */
  release(secret: ReceiptSecret): void {
    secret.discard();
    this.secrets.delete(secret);
  }

  /** Discards every secret held (cancellation, page destroyed). Idempotent. */
  discardAll(): void {
    for (const secret of this.secrets) secret.discard();
    this.secrets.clear();
  }

  /**
   * Discards everything when the current session is not the one the intent started in (sign-out, another account, a
   * revoked session). Returns whether it did.
   */
  discardIfSessionChanged(currentSessionKey: string | null): boolean {
    if (currentSessionKey !== null && currentSessionKey === this.sessionKey) return false;
    this.discardAll();
    return true;
  }
}
