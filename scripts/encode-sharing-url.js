'use strict';

/**
 * Encodes a OneDrive sharing URL into a shareId accepted by the shares API.
 * Example output format: u!aHR0cHM6Ly8xZHJ2Lm1zL...
 */
function encodeSharingUrl(url) {
  const base64 = Buffer.from(url).toString('base64');
  return (
    'u!' +
    base64
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  );
}

if (require.main === module) {
  const input = process.argv[2];

  if (!input) {
    console.error('Usage: node scripts/encode-sharing-url.js "<shared-url>"');
    process.exit(1);
  }

  console.log(encodeSharingUrl(input));
}

module.exports = { encodeSharingUrl };
