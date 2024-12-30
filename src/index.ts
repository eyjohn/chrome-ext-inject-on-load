/** Gets all the tabs whose URLs match any of the provided URLs.
 *
 * This functions filters on tab status and excludes sensitive URLs.
 */
async function getMatchedTabIds(
  matchUrls: string[],
  status?: 'loading' | 'complete',
): Promise<Set<number>> {
  const queryInfo: chrome.tabs.QueryInfo = { url: matchUrls };
  if (status) {
    queryInfo.status = status;
  }
  const tabIds = new Set<number>();
  const tabs = await chrome.tabs.query(queryInfo);
  for (const tab of tabs) {
    if (
      tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('about:blank')
    ) {
      tabIds.add(tab.id!);
    }
  }
  return tabIds;
}

/** Injects content scripts and CSS into tabs
 *
 * This function honours the manifest `host_permissions` as well as
 * `content_scripts` level `matches` and `exclude_matches` fields.
 */
export async function injectContentScripts() {
  const manifest = chrome.runtime.getManifest() as chrome.runtime.ManifestV3;
  const hostPermissions = manifest.host_permissions || [];
  const contentScripts = manifest.content_scripts || [];

  const hostPermissionTabsPromise = getMatchedTabIds(hostPermissions);

  const contentScriptPromises = contentScripts.map(async (script) => {
    const matchesTabsPromise = getMatchedTabIds(script.matches!, 'complete');
    const excludeMatchesTabsPromise = script.exclude_matches
      ? getMatchedTabIds(script.exclude_matches)
      : Promise.resolve(new Set<number>());

    const [matchesTabs, excludeMatchesTabs] = await Promise.all([
      matchesTabsPromise,
      excludeMatchesTabsPromise,
    ]);

    return { script, matchesTabs, excludeMatchesTabs };
  });

  const [hostPermissionTabs, resolvedContentScripts] = await Promise.all([
    hostPermissionTabsPromise,
    Promise.all(contentScriptPromises),
  ]);

  for (const {
    script,
    matchesTabs,
    excludeMatchesTabs,
  } of resolvedContentScripts) {
    for (const tabId of matchesTabs) {
      if (hostPermissionTabs.has(tabId) && !excludeMatchesTabs.has(tabId)) {
        try {
          if (script.css) {
            await chrome.scripting.insertCSS({
              target: { tabId, allFrames: script.all_frames || false },
              files: script.css,
            });
          }
          if (script.js) {
            await chrome.scripting.executeScript({
              target: { tabId, allFrames: script.all_frames || false },
              files: script.js,
              world: script.world || 'ISOLATED',
            });
          }
        } catch (error) {
          const tab = await chrome.tabs.get(tabId);
          console.error(
            'Failed to inject content script into tab:',
            tab,
            error,
          );
        }
      }
    }
  }
}

let ACTIVE_CB: (() => Promise<void>) | null = null;

/** Registers handler to inject content scripts on extension loading. */
export function registerContentScriptInjectOnLoad() {
  if (ACTIVE_CB !== null) {
    throw new Error('Already registered content script injection');
  }
  ACTIVE_CB = async () => {
    await injectContentScripts();
  };
  (self as ServiceWorkerGlobalScope).addEventListener('activate', ACTIVE_CB);
}

/** Unregisters handler to inject content scripts on extension loading. */
export function unregisterContentScriptInjectOnLoad() {
  if (ACTIVE_CB === null) {
    throw new Error('Not registered content script injection');
  }
  (self as ServiceWorkerGlobalScope).removeEventListener('activate', ACTIVE_CB);
  ACTIVE_CB = null;
}
