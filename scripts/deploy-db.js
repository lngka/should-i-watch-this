#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function deployDatabase() {
  console.log('Deploying database schema to Turso...');
  
  // Check if environment variables are set
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('❌ Missing required environment variables:');
    console.error('   TURSO_DATABASE_URL:', !!process.env.TURSO_DATABASE_URL);
    console.error('   TURSO_AUTH_TOKEN:', !!process.env.TURSO_AUTH_TOKEN);
    console.error('');
    console.error('Please set these environment variables and try again.');
    process.exit(1);
  }
  
  const prisma = new PrismaClient();
  
  try {
    // Test connection
    console.log('Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful');
    
    // Create a test job to ensure schema is working
    console.log('Testing schema creation...');
    const testJob = await prisma.job.create({
      data: {
        videoUrl: 'https://example.com/test',
        status: 'PENDING'
      }
    });
    console.log('✅ Test job created:', testJob.id);
    
    // Clean up test job
    await prisma.job.delete({ where: { id: testJob.id } });
    console.log('✅ Test job cleaned up');
    
    console.log('🎉 Database deployment successful!');
    
  } catch (error) {
    console.error('❌ Database deployment failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deployDatabase();
