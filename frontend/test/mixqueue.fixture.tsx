import React from 'react';
import { createRoot } from 'react-dom/client';
import { MixQueueNode, MixQueueServer } from '../components/MixQueue';
import { RehldsManager } from '../components/serverSettings/RehldsManager';
import '@ovhcloud/ods-react/normalize-css';
import '@ovhcloud/ods-themes/default/css';
import '@ovhcloud/ods-themes/default/fonts';
import '../src/ui/theme/ods-dark.css';
import '../styles/globals.css';
document.documentElement.classList.add('dark');
document.body.style.background = '#0a1220';
const parameters = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1160, margin: '32px auto', padding: '0 16px', color: '#e9f0fa' }}>
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        paddingBottom: 24,
        marginBottom: 24,
        borderBottom: '1px solid #27374d',
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Game Panel PRO</h1>
        <p style={{ color: '#93a6bf', marginTop: 7 }}>
          {parameters.has('node') ? 'WAW1 · Nodes' : 'Matchmaking test · Game Config'}
        </p>
      </div>
    </header>
    {parameters.has('node') ? (
      <MixQueueNode nodeId="local" />
    ) : (
      <RehldsManager
        group="addons"
        serverId={700}
        canWrite
        onOpen={() => {}}
        mixqueue={parameters.has('member') ? undefined : <MixQueueServer serverId={700} />}
      />
    )}
  </main>
);
