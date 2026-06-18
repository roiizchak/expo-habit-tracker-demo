/**
 * Client-side password policy check. Mirrors the Supabase hosted policy
 * (minimum length 8 + `lower_upper_letters_digits`) so users get immediate
 * feedback instead of a post-submit server rejection. The server remains
 * authoritative — this is UX only.
 *
 * Used by every place that sets a NEW password (signup, password recovery,
 * change-password). Sign-IN stays exempt so legacy/shorter passwords can still
 * authenticate.
 */
export function passwordIssue(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Password needs uppercase, lowercase, and a number.';
  }
  return null;
}
