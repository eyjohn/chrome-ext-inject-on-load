# chrome-ext-inject-on-load
TypeScript module to enable chrome extensions to inject content scripts on extension load.

NOTE: Currently this extension simply prints hello world.

## Installation

To install the module, use npm:

```
npm install chrome-ext-inject-on-load
```

## Usage

Import the module in your TypeScript file:

```typescript
import { register } from 'chrome-ext-inject-on-load';
register(); // In background script, to be executed immediately.
```

## License

This project is licensed under the MIT License.