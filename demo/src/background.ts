import { registerContentScriptInjectOnLoad } from 'chrome-ext-inject-on-load';

registerContentScriptInjectOnLoad();

setTimeout(() => {
  chrome.runtime.reload();
}, 5000);
