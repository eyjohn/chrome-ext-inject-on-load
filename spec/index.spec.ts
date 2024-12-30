import {
  injectContentScripts,
  registerContentScriptInjectOnLoad,
  unregisterContentScriptInjectOnLoad,
} from '../src/index';

class ChromeMock {
  runtime: jasmine.SpyObj<typeof chrome.runtime> = jasmine.createSpyObj(
    'runtime',
    ['getManifest'],
  );

  tabs: jasmine.SpyObj<typeof chrome.tabs> = jasmine.createSpyObj('tabs', [
    'get',
    'query',
  ]);

  scripting: jasmine.SpyObj<typeof chrome.scripting> = jasmine.createSpyObj(
    'scripting',
    ['executeScript', 'insertCSS'],
  );
}

interface SimpleTab {
  id: number;
  url: string;
  status?: string;
}

/** Pretend to be chrome.tabs.query/get for provided set of tabs. */
class SimpleTabManager {
  constructor(public tabs: SimpleTab[] = []) {}
  async query(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    if (query.url !== undefined && typeof query.url === 'string') {
      query.url = [query.url];
    }
    return this.tabs.filter((tab) => {
      if (query.status && query.status !== tab.status) {
        return false;
      }
      for (const url of query.url!) {
        if (url === '<all_urls>') {
          return true;
        } else {
          const pattern = url.replace(/\./g, '\\.').replace(/\*/g, '.*');
          if (new RegExp(pattern).test(tab.url)) {
            return true;
          }
        }
      }

      return false;
    }) as chrome.tabs.Tab[];
  }
  async get(tabId: number): Promise<chrome.tabs.Tab> {
    return this.tabs.find((tab) => tab.id === tabId) as chrome.tabs.Tab;
  }
}

describe('With chrome and service worker listener spies', () => {
  let tabManager: SimpleTabManager;
  let chromeMock: ChromeMock;
  let addEventListenerSpy: jasmine.Spy<typeof self.addEventListener>;
  let removeEventListenerSpy: jasmine.Spy<typeof self.removeEventListener>;

  beforeEach(() => {
    tabManager = new SimpleTabManager();
    chromeMock = new ChromeMock();
    addEventListenerSpy = jasmine.createSpy('addEventListener');
    removeEventListenerSpy = jasmine.createSpy('removeEventListener');

    chromeMock.runtime.getManifest.and.returnValue({
      host_permissions: ['<all_urls>'],
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['content.js'],
          css: ['content.css'],
        },
      ],
    } as chrome.runtime.ManifestV3);
    chromeMock.tabs.query.and.callFake(tabManager.query.bind(tabManager));
    chromeMock.tabs.get.and.callFake(tabManager.get.bind(tabManager));
    chromeMock.scripting.executeScript.and.resolveTo();
    chromeMock.scripting.insertCSS.and.resolveTo();

    globalThis.chrome = chromeMock as unknown as typeof chrome;
    const self = {
      addEventListener: addEventListenerSpy as typeof self.addEventListener,
      removeEventListener:
        removeEventListenerSpy as typeof self.removeEventListener,
    } as unknown as ServiceWorkerGlobalScope;

    // Unfortunate work around since target test environment doesn't use self
    // as global variable though it is appropriate to use for service workers.
    (globalThis as unknown as { self: ServiceWorkerGlobalScope }).self = self;
  });

  afterEach(() => {
    delete globalThis['chrome' as keyof typeof globalThis];
    delete globalThis['self' as keyof typeof globalThis];
  });

  describe('injectContentScripts', () => {
    it('simple inject CSS & JS', async () => {
      tabManager.tabs = [
        { id: 1, url: 'https://example.com', status: 'complete' },
      ];

      await injectContentScripts();

      expect(
        chromeMock.scripting.executeScript as jasmine.Spy,
      ).toHaveBeenCalledOnceWith({
        target: { tabId: 1, allFrames: false },
        files: ['content.js'],
        world: 'ISOLATED',
      });
      expect(
        chromeMock.scripting.insertCSS as jasmine.Spy,
      ).toHaveBeenCalledOnceWith({
        target: { tabId: 1, allFrames: false },
        files: ['content.css'],
      });
    });

    it('does not inject into sensitive URLs', async () => {
      tabManager.tabs = [
        { id: 1, url: 'chrome://settings', status: 'complete' },
        { id: 2, url: 'chrome-extension://example', status: 'complete' },
        { id: 3, url: 'about:blank', status: 'complete' },
      ];

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    });

    it('does not inject into tabs without host permission', async () => {
      tabManager.tabs = [
        { id: 1, url: 'https://example.other.com', status: 'complete' },
      ];
      chromeMock.runtime.getManifest.and.returnValue({
        host_permissions: ['https://example.com'],
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['content.js'],
            css: ['content.css'],
          },
        ],
      } as chrome.runtime.ManifestV3);

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    });

    it('does not inject into tabs into incomplete tabs', async () => {
      tabManager.tabs = [
        { id: 1, url: 'https://example.com', status: 'loading' },
        { id: 2, url: 'https://example.com', status: 'unloaded' },
      ];
      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
      expect(chromeMock.tabs.query.calls.allArgs()).toEqual([
        [{ url: ['<all_urls>'] }], // host_permissions query
        [{ url: ['<all_urls>'], status: 'complete' }], // matches query
      ]);
    });

    it('does not inject into excluded matches', async () => {
      tabManager.tabs = [
        { id: 1, url: 'https://example.com', status: 'complete' },
      ];
      chromeMock.runtime.getManifest.and.returnValue({
        host_permissions: ['<all_urls>'],
        content_scripts: [
          {
            matches: ['<all_urls>'],
            exclude_matches: ['https://example.com'],
            js: ['content.js'],
            css: ['content.css'],
          },
        ],
      } as chrome.runtime.ManifestV3);

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    });

    it('injects into all frames if specified', async () => {
      tabManager.tabs = [
        { id: 1, url: 'https://example.com', status: 'complete' },
      ];
      chromeMock.runtime.getManifest.and.returnValue({
        host_permissions: ['<all_urls>'],
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['content.js'],
            css: ['content.css'],
            all_frames: true,
          },
        ],
      } as chrome.runtime.ManifestV3);

      await injectContentScripts();

      expect(
        chromeMock.scripting.executeScript as jasmine.Spy,
      ).toHaveBeenCalledOnceWith({
        target: { tabId: 1, allFrames: true },
        files: ['content.js'],
        world: 'ISOLATED',
      });
      expect(
        chromeMock.scripting.insertCSS as jasmine.Spy,
      ).toHaveBeenCalledOnceWith({
        target: { tabId: 1, allFrames: true },
        files: ['content.css'],
      });
    });

    it('injects into correct world if specified', async () => {
      tabManager.tabs = [
        { id: 1, url: 'https://example.com', status: 'complete' },
      ];
      chromeMock.runtime.getManifest.and.returnValue({
        host_permissions: ['<all_urls>'],
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['content.js'],
            world: 'MAIN',
          },
        ],
      } as chrome.runtime.ManifestV3);

      await injectContentScripts();

      expect(
        chromeMock.scripting.executeScript as jasmine.Spy,
      ).toHaveBeenCalledOnceWith({
        target: { tabId: 1, allFrames: false },
        files: ['content.js'],
        world: 'MAIN',
      });
    });
  });

  it('register and unregister event listener', () => {
    // happy case register and unregister
    expect(() => registerContentScriptInjectOnLoad()).not.toThrow();
    expect(() => unregisterContentScriptInjectOnLoad()).not.toThrow();

    // unregister before register
    expect(() => unregisterContentScriptInjectOnLoad()).toThrow();

    //register twice
    registerContentScriptInjectOnLoad(); // initial register
    expect(() => registerContentScriptInjectOnLoad()).toThrow();
    unregisterContentScriptInjectOnLoad(); // cleanup
  });

  it('full integration that registers and dispatches active event', async () => {
    tabManager.tabs = [
      { id: 1, url: 'https://example.com', status: 'complete' },
    ];
    registerContentScriptInjectOnLoad();
    const [eventType, listener] = addEventListenerSpy.calls.mostRecent().args;
    expect(eventType).toBe('activate');
    await listener.bind(globalThis as unknown as ServiceWorkerGlobalScope)(
      new Event('activate'),
    );

    expect(chromeMock.scripting.executeScript).toHaveBeenCalled();
    expect(chromeMock.scripting.insertCSS).toHaveBeenCalled();
  });
});
