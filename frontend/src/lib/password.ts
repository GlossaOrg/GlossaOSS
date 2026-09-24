/** §11: what a password must be. The same rules the server enforces (see `Passwords`), said before the round trip. */
export const passwordRules = 'At least 8 characters, one capital letter, one small letter and one special character.'

export function passwordProblem(password: string, confirmation: string) {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/\p{Lu}/u.test(password)) return 'Use at least one capital letter.'
  if (!/\p{Ll}/u.test(password)) return 'Use at least one small letter.'
  if (!/[^\p{L}\p{N}]/u.test(password)) return 'Use at least one special character.'
  if (password !== confirmation) return 'The two passwords do not match.'
  return null
}
