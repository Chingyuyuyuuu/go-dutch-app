export type AuthUser = {
  uid: string;
  email: string | null;
  /** 'email', 'google' or 'apple'. */
  provider: string;
};

export type AuthErrorReason =
  | 'invalid-email'
  | 'weak-password'
  | 'wrong-credentials'
  | 'email-in-use'
  | 'email-not-confirmed'
  | 'network'
  | 'unavailable'
  | 'other';

export class AuthError extends Error {
  constructor(
    readonly reason: AuthErrorReason,
    message?: string,
  ) {
    super(message ?? reason);
  }
}

export interface AuthService {
  onChange(cb: (user: AuthUser | null) => void): () => void;
  signInWithEmail(email: string, password: string): Promise<void>;
  /** `needsConfirmation` when the project asks new users to confirm their email first. */
  signUpWithEmail(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signInWithGoogle(): Promise<void>;
  signInWithApple(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Deletes the account on the server (public.delete_my_account) and the home photo,
   * then signs out. 'offline' when the server can't be reached.
   */
  deleteAccount(homePhotoPath: string | null): Promise<'ok' | 'offline'>;
}

/** Maps Supabase Auth error codes to reasons the UI can translate. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const name = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
  if (name === 'AuthRetryableFetchError') return new AuthError('network');
  switch (code) {
    case 'email_address_invalid':
    case 'validation_failed':
      return new AuthError('invalid-email');
    case 'weak_password':
      return new AuthError('weak-password');
    case 'invalid_credentials':
      return new AuthError('wrong-credentials');
    case 'user_already_exists':
    case 'email_exists':
      return new AuthError('email-in-use');
    case 'email_not_confirmed':
      return new AuthError('email-not-confirmed');
    default:
      return new AuthError('other', error instanceof Error ? error.message : code);
  }
}
