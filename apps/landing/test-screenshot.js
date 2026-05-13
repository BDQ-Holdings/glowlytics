const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('file://' + __dirname + '/index.html', { waitUntil: 'networkidle' });

  // Wait for hero animations
  await page.waitForTimeout(2500);

  // Hero screenshot
  await page.screenshot({ path: '/tmp/landing-hero-v3.png' });

  // Slowly scroll entire page to trigger ALL reveals
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < totalHeight; y += 200) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(80);
  }

  // Scroll back to top for full page shot
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  // Full page desktop
  await page.screenshot({ path: '/tmp/landing-full-v3.png', fullPage: true });

  // Scroll to specific sections for detail shots
  await page.evaluate(() => document.getElementById('how').scrollIntoView());
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/landing-how-v3.png' });

  await page.evaluate(() => document.getElementById('features').scrollIntoView());
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/landing-features-v3.png' });

  await page.evaluate(() => document.getElementById('science').scrollIntoView());
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/landing-science-v3.png' });

  await page.evaluate(() => document.getElementById('access').scrollIntoView());
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/landing-cta-v3.png' });

  // Mobile full page
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const mobileHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < mobileHeight; y += 200) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/landing-mobile-v3.png', fullPage: true });

  await browser.close();
  console.log('All screenshots saved to /tmp/landing-*-v3.png');
})();
