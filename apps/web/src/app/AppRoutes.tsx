import { Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { GatePage } from '../features/gate/GatePage';
import { PlayerLayout } from '../features/player/PlayerLayout';
import { AdminPage } from '../features/admin/AdminPage';
import { NotFoundPage } from '../features/not-found/NotFoundPage';

const DevelopmentLabs = import.meta.env.DEV
  ? lazy(() => import('../features/content-lab/DevelopmentLabs'))
  : null;

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PlayerLayout>
            <GatePage />
          </PlayerLayout>
        }
      />
      {DevelopmentLabs && (
        <Route
          path="/dev/labs"
          element={
            <Suspense>
              <DevelopmentLabs />
            </Suspense>
          }
        />
      )}
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
