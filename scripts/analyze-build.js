#!/usr/bin/env node
/**
 * Build Analysis Script
 * Analyzes what code is included in dev and prod builds
 * Helps identify if hooks or other code are being tree-shaken out
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIRS = {
  dev: path.join(__dirname, '../build/chrome-mv3-dev'),
  prod: path.join(__dirname, '../build/chrome-mv3-prod'),
};

// Key patterns to search for in the build
const SEARCH_PATTERNS = {
  hooks: [
    'useExecuteView',
    'useExecuteViewApiCalls',
    'useHubspotContact',
    'useCompanyEnrichment',
    'useLinkedInJobs',
    'useLinkedInPosts',
    'useApify',
  ],
  apiCalls: [
    'callBackend',
    'hubspot',
    'apify',
    'coresignal',
    'linkedin-profile',
  ],
  functions: [
    'fetchLinkedInProfileData',
    'hasContentForBatch',
    'isResearchPlayReadyToRun',
  ],
  envVars: [
    'NEXT_PUBLIC_BACKEND_URL',
    'PLASMO_PUBLIC_BACKEND_URL',
    'localhost:8000',
    'herokuapp.com',
  ],
};

function analyzeFile(filePath, buildType) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const size = fs.statSync(filePath).size;
    
    const results = {
      file: fileName,
      size: `${(size / 1024).toFixed(2)} KB`,
      buildType,
      matches: {},
    };

    // Search for each pattern category
    for (const [category, patterns] of Object.entries(SEARCH_PATTERNS)) {
      results.matches[category] = {};
      for (const pattern of patterns) {
        // Case-insensitive search
        const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = content.match(regex);
        if (matches) {
          results.matches[category][pattern] = matches.length;
        }
      }
    }

    // Count total matches
    const totalMatches = Object.values(results.matches)
      .flatMap(cat => Object.values(cat))
      .reduce((sum, count) => sum + count, 0);
    
    results.totalMatches = totalMatches;
    
    return results;
  } catch (error) {
    return {
      file: path.basename(filePath),
      error: error.message,
      buildType,
    };
  }
}

function analyzeBuild(buildType) {
  const buildDir = BUILD_DIRS[buildType];
  
  if (!fs.existsSync(buildDir)) {
    console.log(`\n❌ Build directory not found: ${buildDir}`);
    console.log(`   Run 'npm run build:plasmo' first to create the build.`);
    return null;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 Analyzing ${buildType.toUpperCase()} Build`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Directory: ${buildDir}\n`);

  // Find all JS files
  const jsFiles = fs.readdirSync(buildDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(buildDir, file));

  if (jsFiles.length === 0) {
    console.log('❌ No JavaScript files found in build directory');
    return null;
  }

  const results = jsFiles.map(file => analyzeFile(file, buildType));
  
  // Display results
  console.log(`Found ${jsFiles.length} JavaScript file(s):\n`);
  
  results.forEach(result => {
    if (result.error) {
      console.log(`❌ ${result.file}: ${result.error}`);
      return;
    }

    console.log(`📄 ${result.file} (${result.size})`);
    
    if (result.totalMatches === 0) {
      console.log(`   ⚠️  No matches found for any search patterns`);
    } else {
      console.log(`   ✅ Found ${result.totalMatches} total pattern matches:`);
      
      for (const [category, patterns] of Object.entries(result.matches)) {
        const categoryMatches = Object.entries(patterns)
          .filter(([_, count]) => count > 0);
        
        if (categoryMatches.length > 0) {
          console.log(`      ${category}:`);
          categoryMatches.forEach(([pattern, count]) => {
            console.log(`         - ${pattern}: ${count} occurrence(s)`);
          });
        }
      }
    }
    console.log('');
  });

  return results;
}

function compareBuilds() {
  const devResults = analyzeBuild('dev');
  const prodResults = analyzeBuild('prod');

  if (!devResults || !prodResults) {
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Comparing Dev vs Prod`);
  console.log(`${'='.repeat(60)}\n`);

  // Compare file sizes
  const devFiles = devResults.reduce((acc, r) => {
    if (!r.error) acc[r.file] = r.size;
    return acc;
  }, {});
  
  const prodFiles = prodResults.reduce((acc, r) => {
    if (!r.error) acc[r.file] = r.size;
    return acc;
  }, {});

  console.log('File Size Comparison:');
  const allFiles = new Set([...Object.keys(devFiles), ...Object.keys(prodFiles)]);
  allFiles.forEach(file => {
    const devSize = devFiles[file] || 'N/A';
    const prodSize = prodFiles[file] || 'N/A';
    console.log(`  ${file}:`);
    console.log(`    Dev:  ${devSize}`);
    console.log(`    Prod: ${prodSize}`);
  });

  // Compare pattern matches
  console.log('\nPattern Match Comparison:');
  for (const [category, patterns] of Object.entries(SEARCH_PATTERNS)) {
    console.log(`\n  ${category}:`);
    for (const pattern of patterns) {
      const devCount = devResults
        .flatMap(r => r.matches?.[category]?.[pattern] || 0)
        .reduce((sum, count) => sum + count, 0);
      
      const prodCount = prodResults
        .flatMap(r => r.matches?.[category]?.[pattern] || 0)
        .reduce((sum, count) => sum + count, 0);

      if (devCount > 0 || prodCount > 0) {
        const status = devCount === prodCount ? '✅' : '⚠️';
        console.log(`    ${status} ${pattern}:`);
        console.log(`       Dev:  ${devCount} occurrence(s)`);
        console.log(`       Prod: ${prodCount} occurrence(s)`);
        
        if (devCount > 0 && prodCount === 0) {
          console.log(`       ⚠️  WARNING: Found in dev but NOT in prod!`);
        } else if (devCount === 0 && prodCount > 0) {
          console.log(`       ⚠️  WARNING: Found in prod but NOT in dev!`);
        }
      }
    }
  }
}

// Main execution
const args = process.argv.slice(2);
const command = args[0] || 'compare';

switch (command) {
  case 'dev':
    analyzeBuild('dev');
    break;
  case 'prod':
    analyzeBuild('prod');
    break;
  case 'compare':
  default:
    compareBuilds();
    break;
}

console.log(`\n${'='.repeat(60)}`);
console.log('💡 Tips:');
console.log('  - If hooks are missing, check for tree-shaking issues');
console.log('  - If env vars show localhost in prod, check .env.production');
console.log('  - Minified code may have different names - search for function bodies');
console.log(`${'='.repeat(60)}\n`);

