import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import Admin from "./Admin.tsx";
import ErrorBoundary from "./ErrorBoundary";
import Home from "./Home.tsx";
import "./i18n";
import "./index.css";

const router = createBrowserRouter([
	{ path: "/", element: <Home />, errorElement: <ErrorBoundary /> },
	{ path: "/admin", element: <Admin />, errorElement: <ErrorBoundary /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>,
);
