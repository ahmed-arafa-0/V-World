import { Route, Routes } from 'react-router-dom';
import { GatePage } from '../features/gate/GatePage';
import { AdminPage } from '../features/admin/AdminPage';
import { NotFoundPage } from '../features/not-found/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<GatePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
