import { createRoot } from "react-dom/client";
import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./i18n";

const Landing = lazy(() => import("./pages/Landing"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const LandingLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <span className="font-serif text-2xl tracking-wide text-primary">Eïa</span>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Suspense fallback={<LandingLoader />}>
        <Landing />
      </Suspense>
    </BrowserRouter>
  </QueryClientProvider>,
);
