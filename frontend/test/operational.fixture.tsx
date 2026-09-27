import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationalOverview } from '../components/OperationalOverview';
import '../styles/globals.css';
createRoot(document.getElementById('root')!).render(<OperationalOverview servers={[{ runtimeId: 8, displayId: 'SRV-27', node: { id: 'local' } }]} />);
