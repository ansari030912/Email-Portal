const { randomBytes } = require("crypto");
const { argon2id, argon2Verify } = require("hash-wasm");

// Same argon2id parameters as DEFA (utils/passwordHash.js) - WebAssembly build,
// so it works on Windows / Linux / Docker without native binaries.
const ARGON2_OPTIONS = {
  parallelism: 4,
  iterations: 3,
  memorySize: 65536,
  hashLength: 32,
  outputType: "encoded",
};

const hashPassword = (password) =>
  argon2id({ password, salt: randomBytes(16), ...ARGON2_OPTIONS });

const verifyPassword = async (password, storedHash) => {
  if (!storedHash || !password) return false;
  try {
    return await argon2Verify({ password, hash: storedHash });
  } catch (error) {
    return false;
  }
};

// Min 8 chars, upper, lower, number and special character
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;
const validatePasswordStrength = (password) =>
  typeof password === "string" && PASSWORD_RULE.test(password);

module.exports = { hashPassword, verifyPassword, validatePasswordStrength };
