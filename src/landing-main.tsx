import { createRoot } from "react-dom/client";
import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "./contexts/UserContext";
import { AppLoader } from "./components/AppLoader";
import "./index.css";
import "./i18n";

const Landing = lazy(() => import("./pages/Landing"));
const Compare = lazy(() => import("./pages/Compare"));
const CompareDetail = lazy(() => import("./pages/CompareDetail"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Changelog = lazy(() => import("./pages/Changelog"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const LandingLoader = () => <AppLoader />;

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <UserProvider>
        <Suspense fallback={<LandingLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/compare/:slug" element={<CompareDetail />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </Suspense>
      </UserProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
