import { expect, test, type Page } from '@playwright/test';

// Deterministic component coverage uses real React/module code with controlled
// transport callbacks. The existing connection and legacy-signout journeys keep
// exercising real Firebase authorization and are never replaced by this fixture.
async function mountConnections(page: Page) {
  // This isolated component page has no HMR websocket; keep dev transport noise
  // separate from application page errors, which must all remain observable.
  await page.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: `
    export function createHotContext() { return { data: {}, accept() {}, dispose() {}, invalidate() {}, on() {}, send() {} }; }
    export function injectQuery(url) { return url; }
  ` }));
  await page.addInitScript(() => {
    const fixture: any = {
      auth: { currentUser: { uid: 'viewer-a' } }, db: {}, listeners: [], inspections: [],
      collection: (_database: unknown, ...segments: string[]) => ({ path: segments.join('/'), kind: 'collection' }),
      doc: (_database: unknown, ...segments: string[]) => ({ path: segments.join('/'), kind: 'doc' }),
    };
    fixture.onSnapshot = (reference: any, next: any, error: any) => {
      const listener = { ...reference, next, error, unsubscribed: false };
      fixture.listeners.push(listener);
      return () => { listener.unsubscribed = true; };
    };
    fixture.identityRequest = () => new Promise(resolve => fixture.inspections.push({ ownerUid: fixture.auth.currentUser?.uid, resolve }));
    fixture.deliver = (listener: any, owner: 'A' | 'B') => {
      const peerUid = owner === 'A' ? 'peer-a' : 'peer-b';
      const value = listener.kind === 'collection'
        ? { peerUid, state: 'pending', requester: 'other', generation: 'generation-' + owner }
        : listener.path.startsWith('profiles/')
          ? { name: `Viewer ${owner} peer`, state: 'active' }
          : listener.path.startsWith('connectionContacts/')
            ? { phone: `${owner}-PRIVATE-CONTACT` }
            : { peerUid: 'peer-a', state: 'accepted', requester: 'other', generation: 'generation-' + owner };
      listener.next({ docs: [{ data: () => value }], exists: () => true, data: () => value });
    };
    (window as any).connectionFixture = fixture;
  });
  await page.route('**/src/connections.tsx?connection-regression', async route => {
    const response = await route.fetch();
    let source = await response.text();
    for (const [pattern, replacement] of [
      [/import\s*\{\s*collection,\s*doc,\s*onSnapshot\s*\}\s*from\s*["'][^"']*firebase_firestore[^"']*["'];?/, 'const { collection, doc, onSnapshot } = window.connectionFixture;'],
      [/import\s*\{\s*auth,\s*db\s*\}\s*from\s*["'][^"']*\/firebase(?:\.ts)?["'];?/, 'const { auth, db } = window.connectionFixture;'],
      [/import\s*\{\s*identityRequest\s*\}\s*from\s*["'][^"']*\/identity(?:\.tsx)?["'];?/, 'const { identityRequest } = window.connectionFixture;'],
    ] as const) {
      expect(source).toMatch(pattern);
      source = source.replace(pattern, replacement);
    }
    await route.fulfill({ response, body: source });
  });
  await page.route('**/connection-regression', async route => {
    const response = await route.fetch({ url: 'http://127.0.0.1:3000/' });
    const original = await response.text();
    const body = original.replace('/src/main.tsx', '/tests/browser/connection-regression-harness.tsx');
    expect(body).not.toBe(original);
    await route.fulfill({ response, body });
  });
  await page.goto('/connection-regression');
  await expect.poll(() => page.evaluate(() => (window as any).connectionFixture.listeners.filter((listener: any) => listener.path === 'connectionViews/viewer-a/peers').length)).toBe(2);
}

async function deliverViewer(page: Page, owner: 'A' | 'B') {
  await page.evaluate(selected => {
    const fixture = (window as any).connectionFixture;
    for (const listener of fixture.listeners.filter((entry: any) => !entry.unsubscribed && entry.kind === 'collection')) fixture.deliver(listener, selected);
  }, owner);
  const uid = owner === 'A' ? 'viewer-a' : 'viewer-b';
  await expect.poll(() => page.evaluate(viewerUid => (window as any).connectionFixture.listeners.filter((listener: any) => !listener.unsubscribed && listener.path === `connectionViews/${viewerUid}/peers/peer-a`).length, uid)).toBeGreaterThan(0);
  await page.evaluate(selected => {
    const fixture = (window as any).connectionFixture;
    for (const listener of fixture.listeners.filter((entry: any) => !entry.unsubscribed && (entry.path.startsWith('profiles/') || entry.path.includes('/peers/')))) fixture.deliver(listener, selected);
  }, owner);
  await expect.poll(() => page.evaluate(() => (window as any).connectionFixture.listeners.filter((listener: any) => !listener.unsubscribed && listener.path === 'connectionContacts/peer-a').length)).toBeGreaterThan(0);
  await page.evaluate(selected => {
    const fixture = (window as any).connectionFixture;
    for (const listener of fixture.listeners.filter((entry: any) => !entry.unsubscribed && entry.path.startsWith('connectionContacts/'))) fixture.deliver(listener, selected);
  }, owner);
}

for (const transition of ['sign-out', 'account-switch'] as const) {
  test(`connection consumers cancel queued private state during ${transition}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', issue => errors.push(issue.message));
    await mountConnections(page);
    await deliverViewer(page, 'A');
    await expect(page.getByTestId('indicator')).toContainText('1 incoming');
    await expect(page.getByTestId('connections-page')).toContainText('Viewer A peer');
    await expect(page.getByTestId('connection-panel')).toContainText('A-PRIVATE-CONTACT');
    await page.evaluate(mode => {
      const fixture = (window as any).connectionFixture;
      fixture.previous = [...fixture.listeners];
      const requestsBeforeTransition = fixture.inspections.length;
      fixture.auth.currentUser = mode === 'sign-out' ? null : { uid: 'viewer-b' };
      // A still-mounted old button must never borrow the new viewer's token.
      const staleButton = Array.from(document.querySelectorAll('[data-testid="connection-panel"] button')).find(button => button.textContent === 'Unfriend') as HTMLButtonElement;
      staleButton.click();
      fixture.staleActionBlocked = fixture.inspections.length === requestsBeforeTransition;
      // Deliver an already queued callback before the parent auth gate rerenders.
      for (const listener of fixture.previous) fixture.deliver(listener, 'A');
      (window as any).renderConnections();
    }, transition);
    expect(await page.evaluate(() => (window as any).connectionFixture.staleActionBlocked)).toBe(true);
    await expect(page.getByTestId('connection-panel')).not.toContainText('A-PRIVATE-CONTACT');
    await expect(page.getByTestId('connections-page')).not.toContainText('Viewer A peer');
    await expect.poll(() => page.evaluate(() => (window as any).connectionFixture.previous.every((listener: any) => listener.unsubscribed))).toBe(true);
    await page.evaluate(() => {
      const fixture = (window as any).connectionFixture;
      for (const listener of fixture.previous) {
        fixture.deliver(listener, 'A');
        listener.error?.(new Error('STALE-A-ERROR'));
      }
      for (const inspection of fixture.inspections.filter((entry: any) => entry.ownerUid === 'viewer-a')) inspection.resolve({ state: 'blocked', peerFields: ['phone'] });
      fixture.auth.currentUser = { uid: 'viewer-b' };
      (window as any).renderConnections();
    });
    await expect.poll(() => page.evaluate(() => (window as any).connectionFixture.listeners.filter((listener: any) => !listener.unsubscribed && listener.path === 'connectionViews/viewer-b/peers').length)).toBe(2);
    await expect(page.getByTestId('connection-panel')).not.toContainText('A-PRIVATE-CONTACT');
    await deliverViewer(page, 'B');
    await expect(page.getByTestId('connections-page')).toContainText('Viewer B peer');
    await expect(page.getByTestId('connection-panel')).toContainText('B-PRIVATE-CONTACT');
    await expect(page.locator('body')).not.toContainText('STALE-A-ERROR');
    await expect(page.locator('body')).not.toContainText('A-PRIVATE-CONTACT');
    await page.evaluate(() => {
      const fixture = (window as any).connectionFixture;
      fixture.auth.currentUser = null;
      for (const listener of fixture.listeners.filter((entry: any) => !entry.unsubscribed)) fixture.deliver(listener, 'B');
      (window as any).renderConnections();
    });
    await expect(page.getByTestId('indicator')).toBeEmpty();
    await expect(page.getByTestId('connections-page')).toBeEmpty();
    await expect(page.getByTestId('connection-panel')).toBeEmpty();
    expect(await page.evaluate(() => (window as any).connectionFixture.listeners.some((listener: any) => /undefined|null/.test(listener.path)))).toBe(false);
    expect(errors).toEqual([]);
  });
}
