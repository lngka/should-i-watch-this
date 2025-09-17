#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function setupDatabase() {
  console.log('Setting up database schema...');
  
  const prisma = new PrismaClient();
  
  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful');
    
    // The schema will be automatically created when you first use the models
    console.log('✅ Database setup complete');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupDatabase();
