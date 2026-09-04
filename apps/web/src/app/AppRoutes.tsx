import { Route, Routes } from 'react-router-dom';
import { HomePage } from '../features/home/HomePage';
import { AdminPage } from '../features/admin/AdminPage';
import { NotFoundPage } from '../features/not-found/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
