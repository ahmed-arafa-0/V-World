import { BrowserRouter } from 'react-router-dom';
import { usePageOpenLog } from '../hooks/usePageOpenLog';
import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from './AppShell';
import { AppRoutes } from './AppRoutes';

export function App() {
  usePageOpenLog();

  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
