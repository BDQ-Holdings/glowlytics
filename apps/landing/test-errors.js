const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('file://' + __dirname + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Test hamburger toggle
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const toggleVisible = await page.isVisible('#nav-toggle');
  console.log('Hamburger visible on mobile:', toggleVisible);

  if (toggleVisible) {
    await page.click('#nav-toggle');
    await page.waitForTimeout(200);
    const menuOpen = await page.isVisible('#nav-links.open');
    console.log('Menu opens on click:', menuOpen);
  }

  // Test scroll reveals
  await page.setViewportSize({ width: 1440, height: 900 });
  const hasRevealInit = await page.evaluate(() => document.documentElement.classList.contains('reveal-init'));
  console.log('reveal-init class added:', hasRevealInit);

  // Test all anchor links
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))
  );
  for (const href of hrefs) {
    const exists = await page.evaluate(h => !!document.querySelector(h), href);
    if (!exists) console.log('BROKEN anchor:', href);
  }

  // Test skip link
  const skipLink = await page.isVisible('.skip-link');
  console.log('Skip link exists (hidden):', !skipLink);

  // Test form label
  const hasLabel = await page.evaluate(() => !!document.querySelector('label[for="email-input"]'));
  console.log('Email form has label:', hasLabel);

  // Check ARIA
  const navAria = await page.evaluate(() => document.querySelector('nav')?.getAttribute('aria-label'));
  console.log('Nav aria-label:', navAria);

  if (errors.length) {
    console.log('\nJS ERRORS:');
    errors.forEach(e => console.log(' -', e));
  } else {
    console.log('\nNo JS errors found!');
  }

  await browser.close();
})();
