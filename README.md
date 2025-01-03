# chrome-ext-inject-on-load

Module to enable Chrome extensions to inject content scripts on extension load.

Chrome does not inject content scripts as defined in the manifest on loading
events (install, upgrade, toggle off/on, reload), unlike Firefox, and may
require content scripts to be injected programmatically. This module enables you
to setup this injection process with one line of code if you simply want to
inject scripts just as specified in your manifest file.

## Installation

To install the module, use npm:

```
npm install chrome-ext-inject-on-load
```

## Usage

Import the module in your TypeScript file:

```typescript
import { registerContentScriptInjectOnLoad } from 'chrome-ext-inject-on-load';

// Should be called when running background script.
registerContentScriptInjectOnLoad();
```

In your manifest file, make sure to include the permissions:

```json
{
  "permissions": ["tabs", "scripting"],
  "host_permissions": [
    /* list of urls matching content scripts matches */
  ]
}
```

## Demo

See [demo](demo/README.md) for an example extension and live test.

## How it works

The module performs content script injection in several steps:

1. **Activation Process**

   - Binds to background service worker's `activate` event i.e. 'load', which
     fires once when extension is:
     - Installed
     - Updated
     - Toggled off/on
     - Reloaded (either in UI or programatically)

2. **Reads Manifest and Filters Tabs**

   - Upon activation, reads the manifest
   - Iterates over all `content_scripts` selects tabs based on:
     - Matching the `matches` content script property
     - NOT matching the `exclude_matches` content script property
     - Matching the `host_permissions` extension property
     - Excludes sensitive URLs (chrome://, about:blank)
     - Excludes unloaded tabs (which Chrome would inject on reload anyway)
     - **NOTE: Does not currently support `include_globs` or `exclude_globs`**

3. **Injection**
   - Iterates over every `content_scripts` entry and filtered tabs
   - Injects CSS first and then JavaScript second
   - Respects `all_frames` and `world` content_script settings
   - Waits for injection to complete before continuing to next scripts

## License

This project is licensed under the MIT License.
