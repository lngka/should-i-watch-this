#!/usr/bin/env node

/**
 * Script to manually fix stuck jobs
 * Usage: node scripts/fix-stuck-job.js [jobId]
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixStuckJob(jobId) {
  try {
    console.log(`Attempting to fix stuck job: ${jobId}`);
    
    // Check if job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        videoUrl: true,
        createdAt: true,
        updatedAt: true,
        errorMessage: true
      }
    });
    
    if (!job) {
      console.log(`Job ${jobId} not found`);
      return;
    }
    
    console.log(`Found job:`, {
      id: job.id,
      status: job.status,
      videoUrl: job.videoUrl,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      errorMessage: job.errorMessage
    });
    
    // Only fix jobs that are stuck in RUNNING or PENDING state
    if (job.status === 'RUNNING' || job.status === 'PENDING') {
      const result = await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: 'Manually fixed: Job was stuck and marked as failed'
        }
      });
      
      console.log(`Successfully marked job ${jobId} as FAILED`);
    } else {
      console.log(`Job ${jobId} is not stuck (status: ${job.status})`);
    }
    
  } catch (error) {
    console.error(`Error fixing job ${jobId}:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get job ID from command line arguments
const jobId = process.argv[2];

if (!jobId) {
  console.log('Usage: node scripts/fix-stuck-job.js [jobId]');
  console.log('Example: node scripts/fix-stuck-job.js BfUEDvrD1Y4');
  process.exit(1);
}

fixStuckJob(jobId);
