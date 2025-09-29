import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary.tsx';

const InitialLoader: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}>
    <svg className="animate-spin h-8 w-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <p style={{ marginTop: '1rem', fontSize: '1.125rem', color: '#94a3b8' }}>Loading application...</p>
  </div>
);


const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <GlobalErrorBoundary>
            <Suspense fallback={<InitialLoader />}>
                 <App />
            </Suspense>
        </GlobalErrorBoundary>
    </React.StrictMode>
);