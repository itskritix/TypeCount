/**
 * Generate installer BMP assets from PNG logo
 *
 * For electron-builder NSIS installer:
 * - installerSidebar.bmp: 164x314 pixels (wizard sidebar)
 * - installerHeader.bmp: 150x57 pixels (wizard header)
 *
 * Run: npm run generate:installer-assets
 */

const fs = require('fs');
const path = require('path');

// Try to use sharp if available, otherwise provide manual instructions
async function generateAssets() {
  const buildDir = path.join(__dirname, '..', 'build');
  const assetsDir = path.join(__dirname, '..', 'assets');
  const logoPath = path.join(assetsDir, 'logo.png');

  // Ensure build directory exists
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  console.log('🎨 TypeCount Installer Asset Generator\n');

  // Check if sharp is available
  let sharp;
  try {
    sharp = require('sharp');
    console.log('✓ Sharp library found - generating BMP assets automatically\n');
  } catch (e) {
    console.log('ℹ Sharp library not installed.');
    console.log('  To enable automatic generation, run: npm install sharp --save-dev\n');
    console.log('📋 Manual Instructions:\n');
    printManualInstructions();
    return;
  }

  // Check if logo exists
  if (!fs.existsSync(logoPath)) {
    console.error('❌ Logo not found at:', logoPath);
    return;
  }

  try {
    // Generate installer sidebar (164x314)
    // This is the image shown on the left of the wizard
    console.log('📐 Generating installerSidebar.bmp (164x314)...');

    const sidebarPath = path.join(buildDir, 'installerSidebar.bmp');

    // Create a dark background with logo centered at top
    const sidebarWidth = 164;
    const sidebarHeight = 314;
    const logoSize = 80;

    // Create background
    const sidebarBg = await sharp({
      create: {
        width: sidebarWidth,
        height: sidebarHeight,
        channels: 3,
        background: { r: 26, g: 26, b: 30 } // #1a1a1e dark background
      }
    }).png().toBuffer();

    // Resize logo
    const logoResized = await sharp(logoPath)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // Composite logo onto background
    const sidebar = await sharp(sidebarBg)
      .composite([{
        input: logoResized,
        top: 40,
        left: Math.floor((sidebarWidth - logoSize) / 2)
      }])
      .toFormat('bmp')
      .toFile(sidebarPath);

    console.log('   ✓ Created:', sidebarPath);

    // Generate installer header (150x57)
    console.log('📐 Generating installerHeader.bmp (150x57)...');

    const headerPath = path.join(buildDir, 'installerHeader.bmp');
    const headerWidth = 150;
    const headerHeight = 57;
    const headerLogoSize = 40;

    const headerBg = await sharp({
      create: {
        width: headerWidth,
        height: headerHeight,
        channels: 3,
        background: { r: 26, g: 26, b: 30 }
      }
    }).png().toBuffer();

    const headerLogo = await sharp(logoPath)
      .resize(headerLogoSize, headerLogoSize, { fit: 'contain' })
      .png()
      .toBuffer();

    await sharp(headerBg)
      .composite([{
        input: headerLogo,
        top: Math.floor((headerHeight - headerLogoSize) / 2),
        left: Math.floor((headerWidth - headerLogoSize) / 2)
      }])
      .toFormat('bmp')
      .toFile(headerPath);

    console.log('   ✓ Created:', headerPath);

    console.log('\n✅ All installer assets generated successfully!');
    console.log('\nNote: These are used only for "assisted" installer mode (oneClick: false).');
    console.log('The default "one-click" mode uses just the icon file.\n');

  } catch (error) {
    console.error('❌ Error generating assets:', error.message);
    console.log('\n📋 Manual Instructions:\n');
    printManualInstructions();
  }
}

function printManualInstructions() {
  console.log(`
To create BMP installer assets manually:

1. INSTALLER SIDEBAR (build/installerSidebar.bmp)
   - Size: 164 × 314 pixels
   - Format: 24-bit BMP
   - Content: Logo at top, dark background
   - Used on: Welcome and Finish wizard pages

2. INSTALLER HEADER (build/installerHeader.bmp)
   - Size: 150 × 57 pixels
   - Format: 24-bit BMP
   - Content: Small logo or branding
   - Used on: All other wizard pages

Tools you can use:
- Photoshop / GIMP / Paint.NET
- Online: photopea.com, pixlr.com
- ImageMagick: magick convert logo.png -resize 164x314 -gravity north -background "#1a1a1e" -extent 164x314 installerSidebar.bmp

Background color recommendation: #1a1a1e (dark gray)

Note: BMP files are only needed for "assisted" installer mode.
The default "oneClick" mode just uses the icon.ico file!
`);
}

// Run the generator
generateAssets().catch(console.error);
