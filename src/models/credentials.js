export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

export function withoutSpaces(value) {
  return String(value || "").replace(/\s/g, "");
}

export function loginFieldError(username, password, { passwordRequired = true } = {}) {
  const user = withoutSpaces(username);
  const pass = withoutSpaces(password);
  if (user.length < USERNAME_MIN || user.length > USERNAME_MAX) {
    return `El usuario debe tener entre ${USERNAME_MIN} y ${USERNAME_MAX} caracteres, sin espacios.`;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(user)) {
    return "El usuario solo admite letras, números, punto, guion y guion bajo. Sin espacios.";
  }
  if (!passwordRequired && !pass) return "";
  if (pass.length < PASSWORD_MIN || pass.length > PASSWORD_MAX) {
    return `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres, sin espacios.`;
  }
  return "";
}
