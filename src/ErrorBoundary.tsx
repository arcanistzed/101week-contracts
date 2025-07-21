import { useRouteError } from "react-router";

type RouteError = {
	status: number;
	statusText: string;
	internal: boolean;
	data: string;
	error: Record<string, unknown>;
};

function isRouteError(error: unknown): error is RouteError {
	return (
		typeof error === "object" &&
		error !== null &&
		("status" in error || "statusText" in error || "data" in error)
	);
}

export default function ErrorBoundary() {
	const error = useRouteError();
	return (
		<main className="error-boundary">
			{isRouteError(error) ? (
				<>
					{error.status && <h1>{error.status}</h1>}
					{error.statusText && <h2>{error.statusText}</h2>}
					{error.data && <p>{error.data}</p>}
				</>
			) : (
				<>
					<h1>Unexpected Error</h1>
					<p>
						{(error as Error).message ||
							"An unknown error occurred."}
					</p>
				</>
			)}
		</main>
	);
}
