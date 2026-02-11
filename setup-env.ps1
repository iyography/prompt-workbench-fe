# Setup Environment Variables for Chrome Extension
# Run this script to create the necessary .env files

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "  Setting up Environment Variables" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

$localEnv = @"
# Local Development Environment Variables
# Backend API URL (both set to the same value for consistency)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/api
PLASMO_PUBLIC_BACKEND_URL=http://localhost:8000/api
"@

$prodEnv = @"
# Production Environment Variables
# Backend API URL (both set to the same value for consistency)
NEXT_PUBLIC_BACKEND_URL=https://prompt-workbench-be-751bd9fb40e6.herokuapp.com/api
PLASMO_PUBLIC_BACKEND_URL=https://prompt-workbench-be-751bd9fb40e6.herokuapp.com/api

# Enable debug logging in production builds (helps diagnose issues)
DEBUG_PLAYS=true
"@

$defaultEnv = @"
# Default Environment Variables (fallback)
# Backend API URL (both set to the same value for consistency)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/api
PLASMO_PUBLIC_BACKEND_URL=http://localhost:8000/api
"@

# Create .env.local
Write-Host "Creating .env.local..." -ForegroundColor Yellow
$localEnv | Out-File -FilePath ".env.local" -Encoding utf8
Write-Host "✅ Created .env.local" -ForegroundColor Green

# Create .env.production
Write-Host "Creating .env.production..." -ForegroundColor Yellow
$prodEnv | Out-File -FilePath ".env.production" -Encoding utf8
Write-Host "✅ Created .env.production" -ForegroundColor Green

# Create .env
Write-Host "Creating .env..." -ForegroundColor Yellow
$defaultEnv | Out-File -FilePath ".env" -Encoding utf8
Write-Host "✅ Created .env" -ForegroundColor Green

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Green
Write-Host "  Environment files created successfully!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green
Write-Host ""

Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "  1. Build production Chrome extension:" -ForegroundColor Yellow
Write-Host "     npm run build" -ForegroundColor White
Write-Host ""
Write-Host "  2. Load the extension from:" -ForegroundColor Yellow
Write-Host "     build/chrome-mv3-prod/" -ForegroundColor White
Write-Host ""
Write-Host "  3. Test the production build" -ForegroundColor Yellow
Write-Host ""
Write-Host "WHAT CHANGED:" -ForegroundColor Cyan
Write-Host "  • Both NEXT_PUBLIC_BACKEND_URL and PLASMO_PUBLIC_BACKEND_URL" -ForegroundColor White
Write-Host "    are now set to the same value" -ForegroundColor White
Write-Host "  • Production build uses Heroku backend" -ForegroundColor White
Write-Host "  • Debug logging enabled in production (DEBUG_PLAYS=true)" -ForegroundColor White
Write-Host ""

