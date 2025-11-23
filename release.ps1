# TypeCount Release Script
# Usage: .\release.ps1 <version>
# Example: .\release.ps1 1.0.1

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# Validate version format
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "Invalid version format. Use semantic versioning (e.g., 1.0.1)"
    exit 1
}

Write-Host "🚀 Releasing TypeCount v$Version" -ForegroundColor Cyan
Write-Host ""

# Update package.json version
Write-Host "📝 Updating package.json..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"

Write-Host "✅ Version updated to $Version" -ForegroundColor Green
Write-Host ""

# Show git status
Write-Host "📊 Git Status:" -ForegroundColor Yellow
git status --short

Write-Host ""
$commit = Read-Host "Commit and push? (y/n)"

if ($commit -eq "y" -or $commit -eq "Y") {
    # Commit changes
    Write-Host "💾 Committing changes..." -ForegroundColor Yellow
    git add package.json
    git commit -m "Release v$Version"
    
    # Create tag
    Write-Host "🏷️  Creating tag v$Version..." -ForegroundColor Yellow
    git tag "v$Version"
    
    # Push
    Write-Host "📤 Pushing to GitHub..." -ForegroundColor Yellow
    git push origin main
    git push origin "v$Version"
    
    Write-Host ""
    Write-Host "✅ Release v$Version pushed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🤖 GitHub Actions will now:" -ForegroundColor Cyan
    Write-Host "   1. Build for Windows, macOS, and Linux"
    Write-Host "   2. Create a GitHub Release"
    Write-Host "   3. Upload installers to the release"
    Write-Host ""
    Write-Host "📦 View the release at:" -ForegroundColor Cyan
    Write-Host "   https://github.com/itskritix/TypeCount/releases/tag/v$Version"
} else {
    Write-Host "❌ Release cancelled. Changes not committed." -ForegroundColor Red
    Write-Host ""
    Write-Host "To commit manually:" -ForegroundColor Yellow
    Write-Host "   git add package.json"
    Write-Host "   git commit -m 'Release v$Version'"
    Write-Host "   git tag v$Version"
    Write-Host "   git push origin main --tags"
}
