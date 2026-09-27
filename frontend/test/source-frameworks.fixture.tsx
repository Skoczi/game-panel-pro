import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NativeGameConfig } from '../components/serverSettings/NativeGameConfig';
import { ThemeProvider } from '../contexts/ThemeContext';
import { SOURCE_TEMPLATES } from '../../backend/src/templates/sourceTemplates';
import '@ovhcloud/ods-react/normalize-css';
import '@ovhcloud/ods-themes/default/css';
import '../src/ui/theme/ods-dark.css';
import '../src/ui/theme/ods-light.css';
import '../styles/globals.css';
const query = new URLSearchParams(location.search);
const template = SOURCE_TEMPLATES.find(
  (t) => t.id === `builtin-${query.get('game') || 'cs2'}-native`
)!.document;
function Fixture() {
  const [opened, setOpened] = useState('');
  return (
    <ThemeProvider>
      <main style={{ padding: 20, maxWidth: 1200, margin: 'auto' }}>
        <NativeGameConfig
          serverId={107}
          metadata={JSON.stringify({ template: { document: template } })}
          canWrite
          canManageFrameworks={!query.has('readonly')}
          onOpen={(p) => setOpened(p)}
          onOpenDirectory={(p) => setOpened(`directory:${p}`)}
        />
        <output hidden aria-label="Opened file">
          {opened}
        </output>
      </main>
    </ThemeProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
