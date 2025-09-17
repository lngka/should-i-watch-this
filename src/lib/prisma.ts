import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.warn("DATABASE_URL not set, using default Prisma client (will fail at runtime if no database)");
		// Create a default client without adapter; will error at runtime if used without a URL
		return new PrismaClient({ log: ["warn", "error"] });
	}
	
	// Check if we have Turso credentials for LibSQL adapter
	if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
		try {
			const adapter = new PrismaLibSQL({
				url: process.env.TURSO_DATABASE_URL,
				authToken: process.env.TURSO_AUTH_TOKEN,
			});
			console.log("Creating Prisma client with LibSQL adapter");
			return new PrismaClient({ adapter, log: ["warn", "error"] });
		} catch (error) {
			console.error("Failed to create LibSQL adapter:", error);
			// Fall back to default client
		}
	}
	
	console.log("Creating Prisma client with default configuration");
	return new PrismaClient({ log: ["warn", "error"] });
}

export const prisma: PrismaClient = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	(globalForPrisma as { prisma?: PrismaClient }).prisma = prisma;
}

export default prisma;

