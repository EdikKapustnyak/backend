/**
 * One-off CLI for provisioning a platform admin account. There is no
 * public registration endpoint for PlatformAdmin (see admin.model.ts's
 * doc comment) - a cross-tenant admin account is deliberately never
 * self-service, unlike a tenant company's owner signup. Run this once
 * per admin you need to create, from a trusted machine/CI step with
 * direct database access, not exposed over HTTP.
 *
 * Usage:
 *   npm run create-admin -- --email=admin@axisdigital.io --password=Sup3rSecret! --name="Nikita Petrov"
 *
 * Exits non-zero (without creating anything) if the email already exists,
 * the password fails the same strength rule as tenant passwords, or a
 * required flag is missing - never silently overwrites an existing admin.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { hashPassword } from '../src/utils/password.js';
import { platformAdminRepository } from '../src/modules/platform-admin/admin.repository.js';

interface ParsedArgs {
  email?: string;
  password?: string;
  name?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (const arg of argv) {
    const match = /^--(email|password|name)=(.*)$/.exec(arg);
    if (match) {
      const [, key, value] = match;
      result[key as keyof ParsedArgs] = value;
    }
  }
  return result;
}

/** Mirrors the tenant passwordSchema's rules exactly (modules/auth/auth.schema.ts) - an admin account deserves at least the same bar as a tenant owner's. */
function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 72) return 'Password must be at most 72 characters';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a digit';
  return null;
}

async function main(): Promise<void> {
  const { email, password, name } = parseArgs(process.argv.slice(2));

  if (!email || !password || !name) {
    console.error(
      'Usage: npm run create-admin -- --email=admin@axisdigital.io --password=Sup3rSecret! --name="Full Name"',
    );
    process.exitCode = 1;
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    console.error(`Invalid password: ${passwordError}`);
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    const exists = await platformAdminRepository.existsByEmail(email);
    if (exists) {
      console.error(`A platform admin with email "${email}" already exists - nothing was changed.`);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await hashPassword(password);
    const admin = await platformAdminRepository.create({ email, passwordHash, name });

    console.log(`Platform admin created: ${admin.email} (${admin.name}), id ${admin._id.toString()}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err: unknown) => {
  console.error('Failed to create platform admin:', err);
  process.exitCode = 1;
});
