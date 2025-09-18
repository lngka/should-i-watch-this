import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
	// Check if we have a database URL
	if (!process.env.DATABASE_URL) {
		console.error("No database configuration found. Please set DATABASE_URL environment variable.");
		throw new Error("Database configuration missing");
	}
	
	// Only log when actually creating a new client (not on every import)
	if (!globalForPrisma.prisma) {
		console.log("Creating Prisma client with PostgreSQL");
	}
	return new PrismaClient({ log: ["warn", "error"] });
}

export const prisma: PrismaClient = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	(globalForPrisma as { prisma?: PrismaClient }).prisma = prisma;
}

export default prisma;

