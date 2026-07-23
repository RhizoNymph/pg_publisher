import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "reactflow/dist/style.css";
import "./styles.css";
import { App } from "./App";
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 1000 } },
});
const root = document.getElementById("root");
if (!root)
    throw new Error("missing #root");
ReactDOM.createRoot(root).render(_jsx(React.StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(App, {}) }) }));
