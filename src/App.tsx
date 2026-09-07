import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ConsolePage from './pages/ConsolePage';
import DevHarnessPage from './pages/DevHarnessPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConsolePage />} />
        <Route path="/dev" element={<DevHarnessPage />} />
        <Route path="*" element={<ConsolePage />} />
      </Routes>
    </BrowserRouter>
  );
}
