# Chrome Extension Local Testing Instructions

## Installing the Extension

1. **Unzip the extension**
   - Extract `chrome-extension-for-testing.zip` to a folder on your computer

2. **Open Chrome Extensions page**
   - Go to `chrome://extensions/` in Chrome
   - Or: Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle "Developer mode" switch in the top right corner

4. **Load the extension**
   - Click "Load unpacked"
   - Select the `chrome-mv3-prod` folder from the extracted zip

5. **Pin the extension**
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "Narrative AI" to keep it visible

## Using the Extension

1. Navigate to a LinkedIn profile page
2. Click the Narrative AI extension icon
3. The side panel will open with research and outreach tools

## Troubleshooting

- **Extension not loading?** Make sure you selected the `chrome-mv3-prod` folder, not the zip file
- **Side panel not opening?** Try refreshing the LinkedIn page
- **Errors?** Check the Console in DevTools (right-click extension → Inspect)

## Backend Connection

The extension connects to:
- Production: `https://prompt-workbench-be-adb79f719636.herokuapp.com/api`

Make sure you're logged in to the web app first to authenticate.
