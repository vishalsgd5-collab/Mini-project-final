import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Monitor from "./pages/Monitor";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import Docket from "./pages/Docket";
import Settings from "./pages/Settings";

function Guard({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="center">Lighting the iris…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <div className="grain" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route
          path="/app"
          element={
            <Guard>
              <ErrorBoundary>
                <Layout />
              </ErrorBoundary>
            </Guard>
          }
        >
          <Route index element={<Navigate to="monitor" replace />} />
          <Route path="monitor" element={<Monitor />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="library" element={<Library />} />
          <Route path="docket" element={<Docket />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
