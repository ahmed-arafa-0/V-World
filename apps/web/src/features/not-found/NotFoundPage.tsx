import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.page}>
      <h1>Page not found</h1>
      <p>This route does not exist yet.</p>
      <Link to="/">Return to Home</Link>
    </div>
  );
}
