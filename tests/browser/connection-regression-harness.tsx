import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
// @ts-expect-error The Vite query isolates the deterministic transport fixture.
import { ConnectionIndicator, ConnectionsPage, ConnectionPanel } from '../../src/connections.tsx?connection-regression';

const root = createRoot(document.getElementById('root')!);
(window as any).renderConnections = () => root.render(<MemoryRouter>
  <div data-testid="indicator"><ConnectionIndicator /></div>
  <div data-testid="connections-page"><ConnectionsPage /></div>
  <div data-testid="connection-panel"><ConnectionPanel peerUid="peer-a" /></div>
</MemoryRouter>);
(window as any).renderConnections();
