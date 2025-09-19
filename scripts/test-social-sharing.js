#!/usr/bin/env node

/**
 * Test script to verify social sharing functionality
 * This script tests the social media data generation with different scenarios
 */

// Mock environment
process.env.SITE_URL = 'https://shouldiwatchthis.com';

// Import the social sharing functions (we'll need to adapt this for Node.js)
const { generateSocialMediaData, generateOpenGraphTags, getYouTubeThumbnail } = require('../src/lib/social-sharing.ts');

console.log('🧪 Testing Social Sharing Functionality\n');

// Test cases
const testCases = [
  {
    name: 'Completed Analysis with Trust Score',
    videoMetadata: {
      title: 'How to Build a React App in 2024',
      channel: 'Tech Tutorials',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    },
    analysis: {
      oneLiner: 'A comprehensive guide to building modern React applications with the latest best practices.',
      trustScore: 85,
      bulletPoints: [
        'Covers React 18 features and hooks',
        'Includes TypeScript integration',
        'Shows modern build tools and deployment'
      ]
    },
    status: 'COMPLETED',
    jobId: 'test-job-123'
  },
  {
    name: 'Running Analysis',
    videoMetadata: {
      title: 'Amazing Science Facts',
      channel: 'Science Channel',
      url: 'https://www.youtube.com/watch?v=example123'
    },
    analysis: undefined,
    status: 'RUNNING',
    jobId: 'test-job-456'
  },
  {
    name: 'Failed Analysis',
    videoMetadata: {
      title: 'Private Video',
      channel: 'Private Channel',
      url: 'https://www.youtube.com/watch?v=private123'
    },
    analysis: undefined,
    status: 'FAILED',
    jobId: 'test-job-789'
  }
];

// Test YouTube thumbnail generation
console.log('📸 Testing YouTube Thumbnail Generation:');
const testVideoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const thumbnail = getYouTubeThumbnail(testVideoUrl, 'hqdefault');
console.log(`✅ Thumbnail URL: ${thumbnail}\n`);

// Test each scenario
testCases.forEach((testCase, index) => {
  console.log(`📋 Test Case ${index + 1}: ${testCase.name}`);
  
  try {
    const socialData = generateSocialMediaData(
      testCase.videoMetadata,
      testCase.analysis,
      testCase.status,
      testCase.jobId
    );
    
    console.log(`   Title: ${socialData.title}`);
    console.log(`   Description: ${socialData.description}`);
    console.log(`   Image: ${socialData.image}`);
    console.log(`   URL: ${socialData.url}`);
    console.log(`   Type: ${socialData.type}`);
    
    // Generate Open Graph tags
    const ogTags = generateOpenGraphTags(socialData);
    console.log(`   ✅ Open Graph tags generated successfully`);
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('');
});

console.log('🎉 Social sharing tests completed!');
console.log('\n📱 To test on Facebook Messenger:');
console.log('1. Deploy your app to a public URL');
console.log('2. Share a result page URL in Facebook Messenger');
console.log('3. Check that the preview shows:');
console.log('   - Video thumbnail (if available)');
console.log('   - Video title');
console.log('   - Analysis preview (if completed)');
console.log('   - Proper fallback image (if no thumbnail)');
