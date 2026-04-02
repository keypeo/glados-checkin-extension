# GLaDOS Auto Check-in Extension

A browser extension that automatically opens the GLaDOS check-in page and attempts to complete the daily check-in the first time you open your browser each day.

## Features
- Automatically attempts a check-in the first time you open your browser each day.
- Supports manual check-in from the extension popup.
- Supports a custom check-in button selector to handle page structure changes.

## Installation
1. Open your browser extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Enable Developer Mode.
3. Choose Load unpacked.
4. Select this directory: `glados-checkin-extension/glados-checkin-extension`.

## Usage
- Automatic check-in: triggered once when you open the browser for the first time each day.
- Manual check-in: click the extension icon and then click `Check In Now` in the popup.
- Options page:
  - Custom button selector
  - Automatically close the tab after check-in

## Notes
- You must stay logged in on `glados.cloud`.
- If the page structure changes, update the correct CSS selector in the options page.
