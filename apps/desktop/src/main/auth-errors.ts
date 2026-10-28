// Sign-in errors that modules without MSAL (the collection runner) can
// recognise. Kept apart from auth.ts so importing them never loads MSAL.

// Microsoft sign-in did not answer, for example while the network is still
// coming back after sleep. The session is kept and the next call tries again.
export const SIGN_IN_UNREACHABLE =
  "Could not reach Microsoft sign-in. Check the network connection and try again.";

export class SignInUnreachableError extends Error {
  constructor() {
    super(SIGN_IN_UNREACHABLE);
  }
}
