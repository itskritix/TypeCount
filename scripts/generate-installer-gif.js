/**
 * Generate installer GIF from HTML animation
 *
 * Run: node scripts/generate-installer-gif.js
 *
 * Requirements:
 *   npm install puppeteer gifencoder png-js --save-dev
 */

const puppeteer = require('puppeteer');
const GIFEncoder = require('gifencoder');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const WIDTH = 420;
const HEIGHT = 300;
const FRAMES = 60;  // Number of frames
const DELAY = 50;   // Delay between frames (ms)

// Helper to replace deprecated page.waitForTimeout
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateGif() {
  console.log('🎬 Generating installer GIF...');

  const htmlPath = path.resolve(__dirname, '../assets/installer/installing-animation.html');
  const outputPath = path.resolve(__dirname, '../assets/installer/installing.gif');

  if (!fs.existsSync(htmlPath)) {
    console.error('❌ HTML animation file not found:', htmlPath);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [`--window-size=${WIDTH},${HEIGHT}`]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.goto(`file://${htmlPath}`);

  // Wait for animations to start
  await sleep(500);

  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  const stream = fs.createWriteStream(outputPath);

  encoder.createReadStream().pipe(stream);
  encoder.start();
  encoder.setRepeat(0);   // 0 = loop forever
  encoder.setDelay(DELAY);
  encoder.setQuality(10); // Lower = better quality

  console.log(`📸 Capturing ${FRAMES} frames...`);

  for (let i = 0; i < FRAMES; i++) {
    const screenshot = await page.screenshot({ type: 'png' });
    const png = PNG.sync.read(screenshot);

    encoder.addFrame(png.data);

    process.stdout.write(`\r   Frame ${i + 1}/${FRAMES}`);
    await sleep(DELAY);
  }

  encoder.finish();
  await browser.close();

  console.log('\n✅ GIF generated successfully!');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

// Check if dependencies are installed
try {
  require('puppeteer');
  require('gifencoder');
  require('pngjs');
  generateGif().catch(console.error);
} catch (e) {
  console.log('📦 Installing required dependencies...');
  const { execSync } = require('child_process');
  execSync('npm install puppeteer gifencoder pngjs --save-dev', { stdio: 'inherit' });
  console.log('✅ Dependencies installed. Run this script again.');
}
