import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		// Test database connectivity
		await prisma.$queryRaw`SELECT 1`;
		
		// Check environment variables
		const envCheck = {
			openai: !!process.env.OPENAI_API_KEY,
			database: !!process.env.DATABASE_URL,
			turso: !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN),
		};
		
		return NextResponse.json({ 
			ok: true, 
			env: envCheck,
			timestamp: new Date().toISOString()
		}, { status: 200 });
	} catch (error) {
		console.error("Health check failed:", error);
		return NextResponse.json({ 
			ok: false, 
			error: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString()
		}, { status: 500 });
	}
}

