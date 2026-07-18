import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./i18n";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });

window.addEventListener("error", (event) => { void import("./api").then(({ api }) => api.reportFrontendError(event.error?.stack || event.message)); });
window.addEventListener("unhandledrejection", (event) => { void import("./api").then(({ api }) => api.reportFrontendError(event.reason?.stack || String(event.reason))); });

createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={queryClient}><AppErrorBoundary><App /></AppErrorBoundary></QueryClientProvider></StrictMode>);
