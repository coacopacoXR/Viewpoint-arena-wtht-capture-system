// ManagerPanel's post-meeting summary section (T4.4).
//
// The section is new UI in a panel that every host sees, so the requirement
// worth a test is the negative one: with any capture provider OTHER than
// 'local' the panel renders exactly as it did before, because a deployment that
// has no capture-service must not be offered a recorder that cannot upload.
//
// The second requirement is that recording never starts on its own. A design
// review is sensitive audio; the host decides when the tape rolls.
//
// Config is driven through the real ConfigProvider with /api/public-config
// stubbed, the same way integrationsPanel.config.test.tsx does it, so "read the
// config" is never confusable with "fell back to the default provider".

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import ManagerPanel from '../ManagerPanel';
import {
  ConfigProvider,
  useConnectorConfig,
} from '../../../lib/config/ConfigContext';
import { resetPublicConfigCache } from '../../../lib/config/publicConfig.ts';

const CONFIG_PATH = '/api/public-config';

/** The tabs that must be there whatever the capture provider is. */
const EXISTING_TABS = ['Actions', 'Notes', 'Curated', 'Capture', 'Comments', 'Chat'];

function publicConfigBody(captureProvider: string) {
  return {
    plm: { provider: 'none' },
    capture: { provider: captureProvider },
    turn: { provider: 'cloudflare' },
    db: { provider: 'supabase' },
    notifications: [],
    modelImport: { provider: 'genericGltf' },
  };
}

function stubConfigFetch(response: unknown | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === CONFIG_PATH) {
        if (response instanceof Error) throw response;
        return { ok: true, status: 200, json: async () => response };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

// Renders alongside the panel so a test can prove the config fetch really
// settled — otherwise the "no section" assertions could pass vacuously because
// nothing was ever fetched.
const ConfigProbe: React.FC = () => {
  const cfg = useConnectorConfig();
  return (
    <div>
      <span data-testid="cfg-available">{String(cfg.available)}</span>
      <span data-testid="cfg-capture">{cfg.capture}</span>
    </div>
  );
};

async function renderPanel(captureProvider: string): Promise<void> {
  stubConfigFetch(publicConfigBody(captureProvider));
  render(
    <ConfigProvider>
      <ConfigProbe />
      <ManagerPanel />
    </ConfigProvider>,
  );
  // `available` is true only when the body really came from the endpoint, so a
  // fallback to 'mock' cannot be mistaken for a configured 'mock' deployment.
  await waitFor(() =>
    expect(screen.getByTestId('cfg-available').textContent).toBe('true'),
  );
  await waitFor(() =>
    expect(screen.getByTestId('cfg-capture').textContent).toBe(captureProvider),
  );
}

function expectExistingTabsIntact(): void {
  for (const tab of EXISTING_TABS) {
    expect(
      screen.queryByRole('button', { name: new RegExp(`^${tab}`) }),
      `the ${tab} tab should still be rendered`,
    ).not.toBeNull();
  }
}

/** Enough of a MediaRecorder/AudioContext for the hook's feature-detect. */
function stubRecordingGlobals() {
  class FakeMediaRecorder {
    static isTypeSupported = (): boolean => true;
    state = 'inactive';
    ondataavailable: unknown = null;
    onstop: unknown = null;
    start(): void {
      this.state = 'recording';
    }
    stop(): void {
      this.state = 'inactive';
    }
  }
  class FakeAudioContext {
    createMediaStreamSource(): { connect: () => void; disconnect: () => void } {
      return { connect: () => {}, disconnect: () => {} };
    }
    createMediaStreamDestination(): { stream: MediaStream } {
      return { stream: {} as MediaStream };
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
}

describe('ManagerPanel — post-meeting summary section', () => {
  beforeEach(() => {
    resetPublicConfigCache();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['mock', 'openai', 'anthropic', 'ollamaDirect'])(
    'renders no recording UI when capture.provider is "%s"',
    async (provider) => {
      await renderPanel(provider);

      expect(screen.queryByText('Post-meeting summary')).toBeNull();
      expect(screen.queryByText('local capture')).toBeNull();
      expect(
        screen.queryByRole('button', { name: /start recording/i }),
      ).toBeNull();
      // And the panel it replaces is untouched.
      expectExistingTabsIntact();
      expect(screen.getByText('Manager Workspace')).toBeInTheDocument();
    },
  );

  it('renders the section when capture.provider is "local"', async () => {
    stubRecordingGlobals();
    await renderPanel('local');

    expect(screen.getByText('Post-meeting summary')).toBeInTheDocument();
    expect(screen.getByText('local capture')).toBeInTheDocument();
    // Everything that was there before is still there.
    expectExistingTabsIntact();
  });

  it('offers recording and does not start it on its own', async () => {
    stubRecordingGlobals();
    await renderPanel('local');

    expect(
      screen.getByRole('button', { name: /start recording/i }),
    ).toBeInTheDocument();
    // No recorder was constructed behind the host's back: the indicator, the
    // elapsed clock and the stop button all appear only after a click.
    expect(screen.queryByText(/recording \d\d:\d\d/i)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /stop & summarise/i }),
    ).toBeNull();
    expect(screen.queryByText(/summarising/i)).toBeNull();
  });

  it('says the browser cannot record rather than offering a control that lies', async () => {
    // jsdom ships neither MediaRecorder nor an AudioContext, which is exactly
    // the environment this branch exists for.
    await renderPanel('local');

    expect(screen.getByText('Post-meeting summary')).toBeInTheDocument();
    expect(
      screen.getByText('This browser cannot record audio.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /start recording/i }),
    ).toBeNull();
  });

  it('renders no section when the config endpoint is unreachable', async () => {
    // The documented fail-safe: config unavailable means "behave as before",
    // which for this panel means no recorder.
    stubConfigFetch(new Error('network down'));
    render(
      <ConfigProvider>
        <ConfigProbe />
        <ManagerPanel />
      </ConfigProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('cfg-available').textContent).toBe('false'),
    );

    expect(screen.getByTestId('cfg-capture').textContent).toBe('mock');
    expect(screen.queryByText('Post-meeting summary')).toBeNull();
    expectExistingTabsIntact();
  });
});
