import base64
import urllib.request
import json
import re

def try_api(url):
    print(f"Testing URL: {url}")
    # Try different encoding styles
    try:
        # Style 1: Standard Base64
        b64 = base64.b64encode(url.encode()).decode().replace('/', '_').replace('+', '-').rstrip('=')
        api_url = f"https://api.onedrive.com/v1.0/shares/u!{b64}/root/children"
        print(f"  Attempting API: {api_url}")
        with urllib.request.urlopen(api_url) as res:
            data = json.loads(res.read())
            return data.get('value', [])
    except Exception as e:
        print(f"  Failed: {e}")
    return None

link = "https://1drv.ms/f/c/97c5e937e7e76f1c/IgAuiJr8Frc_R6pSvEhbhj1wATRFY3lnLV0D7b9Z4SYr-tM"
photos = try_api(link)

if not photos:
    print("\nAPI failed. OneDrive 'Albums' often require specific permissions or 'Folder' sharing.")
    print("Switching to 'Static Cache' strategy...")
else:
    print(f"\nFound {len(photos)} photos!")
    # Save to a local manifest
    with open('data/australia-manifest.json', 'w') as f:
        json.dump(photos, f)
