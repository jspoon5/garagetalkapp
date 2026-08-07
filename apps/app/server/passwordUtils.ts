import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    const parts = hash.split(".");
    if (parts.length !== 2) {
      // Malformed hash - return false instead of throwing
      return false;
    }
    
    const [hashedPassword, salt] = parts;
    if (!hashedPassword || !salt) {
      return false;
    }
    
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    
    // Ensure buffers are same length before comparing
    if (hashedPasswordBuf.length !== buf.length) {
      return false;
    }
    
    return timingSafeEqual(hashedPasswordBuf, buf);
  } catch (error) {
    // Any error in password comparison should return false, not throw
    console.error("Password comparison error:", error);
    return false;
  }
}
