import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ConvexClientProvider } from "./lib/convex";
import { AuthProvider } from "./lib/auth";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <ConvexClientProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ConvexClientProvider>
  </StrictMode>,
);
