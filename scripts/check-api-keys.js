// API Keys Validation Script
// Run: node scripts/check-api-keys.js

require('dotenv').config({ path: '.env.local' });

const checks = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
};

console.log('\n🔍 API Keys Validation Check\n');
console.log('='.repeat(50));

let allValid = true;

Object.entries(checks).forEach(([key, value]) => {
  const status = value ? '✅ CONFIGURED' : '❌ MISSING';
  const display = value ? `${value.substring(0, 20)}...` : 'Not set';
  
  console.log(`${status} ${key}`);
  console.log(`   Value: ${display}\n`);
  
  if (!value && (key === 'GEMINI_API_KEY' || key === 'YOUTUBE_API_KEY')) {
    allValid = false;
  }
});

console.log('='.repeat(50));

if (!allValid) {
  console.log('\n⚠️  REQUIRED API KEYS MISSING!\n');
  console.log('Please add the following to .env.local:\n');
  
  if (!checks.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY=your_key_here');
    console.log('Get from: https://aistudio.google.com/app/apikey\n');
  }
  
  if (!checks.YOUTUBE_API_KEY) {
    console.log('YOUTUBE_API_KEY=your_key_here');
    console.log('Get from: https://console.cloud.google.com/apis/credentials\n');
  }
  
  process.exit(1);
} else {
  console.log('\n✅ All API keys configured!\n');
  console.log('You can now:');
  console.log('1. Start backend: npm run dev');
  console.log('2. Start frontend: cd ../client && npm run dev');
  console.log('3. Generate AI courses\n');
}
