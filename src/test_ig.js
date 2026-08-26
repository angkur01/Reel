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

  // Let's also inspect where "xdt" or "items" or media is
  const idx = html.indexOf('"code"');
  if (idx !== -1) {
    console.log('Context around "code":', html.slice(idx - 100, idx + 200));
  } else {
    console.log('"code" not found. Let us search for "shortcode"');
    const sidx = html.indexOf('"shortcode"');
    if (sidx !== -1) {
      console.log('Context around "shortcode":', html.slice(sidx - 100, sidx + 200));
    }
  }

  // Let's test Instagram GraphQL / public JSON endpoints
  // e.g. https://www.instagram.com/graphql/query/?query_hash=... or clips api
  const igClipsUrl = `https://www.instagram.com/api/v1/clips/user/`;
  console.log('Testing other endpoints...');
}

test();
