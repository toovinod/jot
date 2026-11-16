export function passwordValidationError(password: string, newPassword = true): string | null {
  const bytes = new TextEncoder().encode(password).length;
  if (bytes > 72)
    return "That password is too long. Use fewer characters, especially when using accented letters or symbols.";
  if (newPassword && bytes < 10) return "That password is too short. Add a few more characters.";
  return null;
}
