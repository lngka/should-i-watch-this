import { PrismaClient } from "../generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
	globalForPrisma.prisma || new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
	(globalForPrisma as { prisma?: PrismaClient }).prisma = prisma;
}

export default prisma;

