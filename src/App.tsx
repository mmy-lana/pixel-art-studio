import { StudioLayout } from './app/layout';
import StudioPage from './app/page';

/**
 * Application entry.
 *
 * `StudioLayout` supplies the fixed full-viewport frame and the app-wide CRT
 * filter; `StudioPage` is the assembled workbench. Both live under `src/app` so
 * the file layout still mirrors the plan's structure.
 */
export function App() {
  return (
    <StudioLayout>
      <StudioPage />
    </StudioLayout>
  );
}

export default App;
