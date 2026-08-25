import { BrowserRouter, Routes, Route } from "react-router-dom";
import Root from "./pages/Root";
import ConnectPage from "./pages/ConnectPage";
import NotFound from "./pages/NotFound";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/:instanceId" element={<ConnectPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
