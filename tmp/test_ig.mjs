import fetch from 'node-fetch';

async function test() {
  const username = 'irling';
  const url = `https://www.instagram.com/${username}/reels/`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();
  console.log('Status:', res.status, 'HTML length:', html.length);

  // Search shortcode
  const shortcodeRegex = /"shortcode":"([^"]+)"/g;
  let match;
  const shortcodes = [];
  while ((match = shortcodeRegex.exec(html)) !== null) {
    shortcodes.push(match[1]);
  }
  console.log('Shortcodes found:', shortcodes);

  // Search for code:
  const codeRegex = /"code":"([A-Za-z0-9_-]{9,13})"/g;
  const codes = [];
  while ((match = codeRegex.exec(html)) !== null) {
    codes.push(match[1]);
  }
  console.log('Codes found:', codes);

  // Also check if there is GraphQL or Polling API endpoints or other methods
  // Let's also check profile grid:
  const gridUrl = `https://www.instagram.com/${username}/`;
  const gridRes = await fetch(gridUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const gridHtml = await gridRes.text();
  console.log('Grid HTML length:', gridHtml.length);
  const gridCodes = [];
  while ((match = codeRegex.exec(gridHtml)) !== null) {
    gridCodes.push(match[1]);
  }
  console.log('Grid codes found:', gridCodes);
}

test();
