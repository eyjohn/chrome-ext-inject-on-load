import { injectContentScripts } from '../src/index';

export class ChromeMock {
  runtime = {
    getManifest: jasmine.createSpy('getManifest').and.returnValue({
      host_permissions: ['https://*.example.com/*'],
      content_scripts: [
        {
          matches: ['https://*.example.com/*'],
          exclude_matches: ['https://excluded.example.com/*'],
          js: ['content.js'],
          css: ['styles.css'],
        },
      ],
    }),
  };
  tabs = {
    query: jasmine.createSpy('query').and.resolveTo([]),
    get: jasmine.createSpy('get').and.resolveTo({}),
  };
  scripting = {
    insertCSS: jasmine.createSpy('insertCSS').and.resolveTo(),
    executeScript: jasmine.createSpy('executeScript').and.resolveTo(),
  };
}

describe('With mocked chrome and service worker', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = new ChromeMock();
    globalThis.chrome = chromeMock as unknown as typeof chrome;
    globalThis.addEventListener = jasmine.createSpy('addEventListener');
  });

  afterEach(() => {
    delete globalThis['chrome' as keyof typeof globalThis];
    delete globalThis['addEventListener' as keyof typeof globalThis];
  });

  describe('injectContentScripts', () => {
    it('should not inject into unloaded tabs', async () => {
      chromeMock.tabs.query
        .withArgs({ url: 'https://*.example.com/*', status: 'complete' })
        .and.resolveTo([
          { id: 1, url: 'https://example.com', status: 'loading' },
        ]);

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    });

    it('should not inject into chrome:// tabs', async () => {
      chromeMock.tabs.query
        .withArgs({ url: 'https://*.example.com/*', status: 'complete' })
        .and.resolveTo([{ id: 1, url: 'chrome://extensions' }]);

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    });

    it('should not inject into about:blank tabs', async () => {
      chromeMock.tabs.query
        .withArgs({ url: 'https://*.example.com/*', status: 'complete' })
        .and.resolveTo([{ id: 1, url: 'about:blank' }]);

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    });

    it('should honour host permissions', async () => {
      chromeMock.tabs.query
        .withArgs({ url: 'https://*.example.com/*' })
        .and.resolveTo([{ id: 1, url: 'https://example.com' }]);
      chromeMock.tabs.query
        .withArgs({ url: 'https://*.example.com/*', status: 'complete' })
        .and.resolveTo([{ id: 1, url: 'https://example.com' }]);

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 1, allFrames: false },
        files: ['content.js'],
        world: 'ISOLATED',
      });
    });

    it('should honour exclude_matches', async () => {
      chromeMock.tabs.query
        .withArgs({ url: 'https://*.example.com/*' })
        .and.resolveTo([{ id: 1, url: 'https://excluded.example.com' }]);
      chromeMock.tabs.query
        .withArgs({ url: 'https://excluded.example.com/*' })
        .and.resolveTo([{ id: 1, url: 'https://excluded.example.com' }]);
      chromeMock.tabs.query
        .withArgs({ url: 'https://*.example.com/*', status: 'complete' })
        .and.resolveTo([{ id: 1, url: 'https://excluded.example.com' }]);

      await injectContentScripts();

      expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
      expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    });
  });
});
