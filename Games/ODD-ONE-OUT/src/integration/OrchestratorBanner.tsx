/**
 * OrchestratorBanner — small operator-facing strip shown when the game runs
 * under the experiment controller. Hidden during practice/main trials.
 *
 * IDENTICAL COPY in Games/NO-GO and Games/ODD-ONE-OUT (see sessionBridge.ts).
 */

import React from 'react';
import type { SessionContext } from './sessionBridge';

export type ResultDelivery = 'pending' | 'sending' | 'sent' | 'failed';

interface OrchestratorBannerProps {
  context: SessionContext | null;
  error: string | null;
  delivery: ResultDelivery;
}

export const OrchestratorBanner: React.FC<OrchestratorBannerProps> = ({ context, error, delivery }) => {
  const bad = Boolean(error) || delivery === 'failed';
  const style: React.CSSProperties = {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9000,
    padding: '6px 12px', fontSize: '12px', fontFamily: 'monospace',
    background: bad ? '#7a1010' : context?.is_mock ? '#6b5200' : '#1d2b3a', color: '#fff',
  };
  let text: string;
  if (error) {
    text = `CONTROLLER NOT CONNECTED: ${error}`;
  } else if (!context) {
    text = 'Connecting to experiment controller…';
  } else {
    const tag = context.is_mock ? ' · MOCK — NOT REAL DATA' : context.is_test_session ? ' · TEST SESSION' : '';
    const result = {
      pending: '',
      sending: ' · sending results…',
      sent: ' · results delivered to controller ✓',
      failed: ' · RESULTS NOT DELIVERED — download them on the export screen',
    }[delivery];
    text = `Controller session ${context.session_id} · ${context.mode}${tag}${result}`;
  }
  return <div className="orchestrator-banner" role="status" style={style}>{text}</div>;
};
