import { sql } from "drizzle-orm";
import { getEnv } from "../config/env";
import { closeDatabase, db } from "./index";
import { categories, users } from "./schema";

export const DEFAULT_CATEGORIES = [
  {
    name: "Elektronik",
    description: "Perangkat elektronik dan aksesoris",
  },
  {
    name: "Peralatan Kantor",
    description: "Kebutuhan operasional dan alat tulis kantor",
  },
  {
    name: "Perlengkapan Komputer",
    description: "Periferal dan komponen komputer",
  },
] as const;

export interface SeedConfig {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

type TransactionExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function readSeedConfig(
  raw: Record<string, string | undefined> = process.env,
): SeedConfig {
  const env = getEnv();
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to run development seed script in production");
  }

  const adminName = raw.SEED_ADMIN_NAME?.trim() || "System Administrator";
  const adminEmail = raw.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = raw.SEED_ADMIN_PASSWORD;

  if (!adminEmail) {
    throw new Error(
      "SEED_ADMIN_EMAIL environment variable is required to run seed",
    );
  }
  if (
    !adminPassword ||
    adminPassword.length < 8 ||
    adminPassword.length > 128
  ) {
    throw new Error(
      "SEED_ADMIN_PASSWORD environment variable must be between 8 and 128 characters",
    );
  }

  return {
    adminName,
    adminEmail,
    adminPassword,
  };
}

/**
 * Inserts initial development admin and categories idempotently within an existing transaction.
 */
export async function seedInitialData(
  tx: TransactionExecutor,
  config: SeedConfig,
): Promise<{ adminCreated: boolean; categoriesCreated: number }> {
  const existingAdmin = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`LOWER(BTRIM(${users.email})) = ${config.adminEmail}`)
    .limit(1);

  let adminCreated = false;
  if (existingAdmin.length === 0) {
    const passwordHash = await Bun.password.hash(config.adminPassword, {
      algorithm: "argon2id",
    });

    await tx.insert(users).values({
      name: config.adminName,
      email: config.adminEmail,
      passwordHash,
      role: "admin",
      isActive: true,
    });
    adminCreated = true;
  }

  let categoriesCreated = 0;
  for (const category of DEFAULT_CATEGORIES) {
    const normalized = category.name.trim().toLowerCase();
    const existingCategory = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(sql`LOWER(BTRIM(${categories.name})) = ${normalized}`)
      .limit(1);

    if (existingCategory.length === 0) {
      await tx.insert(categories).values({
        name: category.name,
        description: category.description,
        isActive: true,
      });
      categoriesCreated += 1;
    }
  }

  return { adminCreated, categoriesCreated };
}

export async function runSeed(): Promise<void> {
  const config = readSeedConfig();
  const result = await db.transaction((tx) => seedInitialData(tx, config));

  console.log(
    result.adminCreated
      ? `Seeded initial admin user: ${config.adminEmail}`
      : `Initial admin user already exists: ${config.adminEmail}`,
  );
  console.log(`Seeded ${result.categoriesCreated} new category record(s)`);
}

if (import.meta.main) {
  runSeed()
    .then(() => {
      console.log("Database seed completed successfully");
    })
    .catch((error) => {
      console.error(
        "Database seed failed:",
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase();
    });
}
