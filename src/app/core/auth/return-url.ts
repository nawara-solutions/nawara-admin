/** The sign-in route and its query parameters (docs/ARCHITECTURE.md §6). */
export const SIGN_IN_PATH = '/login';
export const RETURN_URL_PARAM = 'returnUrl';
export const SIGN_IN_REASON_PARAM = 'reason';

/** Why the sign-in page was opened, shown as a banner. Machine values in the URL, never copy. */
export const SIGN_IN_REASONS = ['signed-out', 'session-expired', 'shift-ended'] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

export const isSignInReason = (value: unknown): value is SignInReason =>
  SIGN_IN_REASONS.some((reason) => reason === value);

// An absolute path of unreserved characters: no scheme, no host (`//`), no backslash, no query or fragment.
const PATH_ONLY = /^\/(?!\/)[A-Za-z0-9\-._~%/]*$/;

/**
 * The page to return to after sign-in, or `null`. Only an internal, path-only Admin route is kept, so a crafted link
 * can never send the user to another site (open redirect). The root and the sign-in pages themselves are not kept.
 * Whether the account may open it is decided later, from grants (features/auth landing).
 */
export function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512 || !PATH_ONLY.test(value)) return null;
  if (value === '/' || value === SIGN_IN_PATH || value.startsWith(`${SIGN_IN_PATH}/`)) return null;
  return value;
}
