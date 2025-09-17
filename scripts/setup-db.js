#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function setupDatabase() {
  console.log('Setting up database schema for Neon...');
  
  // Check if environment variables are set
  if (!process.env.DATABASE_URL) {
    console.error('❌ Missing required environment variable:');
    console.error('   DATABASE_URL:', !!process.env.DATABASE_URL);
    console.error('');
    console.error('Please set the DATABASE_URL environment variable and try again.');
    process.exit(1);
  }
  
  const prisma = new PrismaClient();
  
  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful');
    
    // Push the schema to the database
    console.log('Pushing schema to database...');
    const { execSync } = require('child_process');
    execSync('npx prisma db push', { stdio: 'inherit' });
    console.log('✅ Database schema pushed successfully');
    
    console.log('✅ Database setup complete');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupDatabase();
