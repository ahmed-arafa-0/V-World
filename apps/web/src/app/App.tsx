import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from './AppShell';
import { AppRoutes } from './AppRoutes';

export function App() {
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
