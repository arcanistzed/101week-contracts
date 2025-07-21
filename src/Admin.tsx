import { useState } from "react";
import type { LookupResult } from "./types";

// Types for migration report
type MigratedItem = {
	oldKey: string;
	newKey: string;
	emailIndexKey: string;
	copiedR2?: string[];
	updatedSignaturePaths?: Record<string, string | null>;
	deleted?: boolean;
	deletedR2?: string[];
};
type SkippedItem = { oldKey: string; reason: string };
type MigrationReportType = {
	mode: string;
	totalScanned: number;
	migrated: MigratedItem[];
	skipped: SkippedItem[];
	totalMigrated: number;
	totalSkipped: number;
	skipReasons?: Record<string, number>;
	logs?: string[];
};

const fieldLabels = {
	preferredLanguage: "Preferred Language",
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	phone: "Phone",
	languages: "Languages",
	program: "Program",
	rsg1: "RSG 1",
	rsg2: "RSG 2",
	emergencyName: "Emergency Contact Name",
	emergencyPhone: "Emergency Contact Phone",
	emergencyRelationship: "Emergency Contact Relationship",
	dob: "Date of Birth",
	pronouns: "Pronouns",
	medical: "Medical Information",
	accessibility: "Accessibility Requests",
	fullNameParticipant: "Participant Full Name",
	fullNameParent: "Parent Full Name",
};

function LoadingSpinner() {
	return (
		<div className="admin-loading">
			<span className="spinner" aria-label="Loading" />
		</div>
	);
}

function ErrorMessage({ error }: { error: string }) {
	return (
		<span className="admin-error" aria-live="polite">
			{error}
		</span>
	);
}

function ResultTable({ data }: { data: Record<string, unknown> }) {
	return (
		<table>
			<tbody>
				{Object.entries(data)
					.filter(([k, v]) => {
						return (
							k in fieldLabels &&
							(typeof v === "string" ||
								typeof v === "number" ||
								typeof v === "boolean") &&
							v
						);
					})
					.map(([k, v]) => (
						<tr key={k}>
							<td>
								{fieldLabels[k as keyof typeof fieldLabels]}
							</td>
							<td>
								{typeof v === "string" ||
								typeof v === "number" ||
								typeof v === "boolean"
									? v.toString()
									: ""}
							</td>
						</tr>
					))}
			</tbody>
		</table>
	);
}

function AdminResults({ results }: { results: LookupResult[] }) {
	if (results.length === 0) {
		return <span>No entry found.</span>;
	}
	if (results.length === 1) {
		return (
			<ResultTable
				data={results[0].data as unknown as Record<string, unknown>}
			/>
		);
	}
	return (
		<>
			<span>{results.length} results found.</span>
			{results.map(({ key, data }) => (
				<ResultTable
					key={key}
					data={data as unknown as Record<string, unknown>}
				/>
			))}
		</>
	);
}

function Admin() {
	const [input, setInput] = useState("");
	const [results, setResults] = useState<LookupResult[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCheck = async (e: React.FormEvent) => {
		e.preventDefault();
		setResults(null);
		setError(null);
		setLoading(true);
		const trimmed = input.trim();
		if (!trimmed) {
			setError("Please enter a value.");
			setLoading(false);
			return;
		}
		try {
			const resp = await fetch(
				`/lookup?input=${encodeURIComponent(trimmed)}`,
			);
			if (!resp.ok) {
				const msg = await resp.text();
				if (resp.status === 400) {
					setError(
						"Invalid input. Please enter a valid email or full name." +
							(msg && msg !== "Invalid input." ? `\n${msg}` : ""),
					);
				} else if (resp.status === 500) {
					setError(
						"A server error occurred. Please try again later.",
					);
				} else {
					setError(msg || "Unknown error.");
				}
				setResults(null);
				setLoading(false);
				return;
			}
			const data = await resp.json();
			setResults(data);
		} catch {
			setError(
				"A network or unexpected error occurred. Please try again.",
			);
			setResults(null);
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className="admin-container">
			<form onSubmit={handleCheck} className="admin-form">
				<label htmlFor="input">Email or Full Name:</label>
				<input
					id="input"
					type="text"
					value={input}
					onChange={e => setInput(e.target.value)}
					required
					disabled={loading}
				/>
				<div className="admin-buttons">
					<button type="submit" disabled={loading || !input.trim()}>
						{loading ? "Checking..." : "Check"}
					</button>
					<button
						type="button"
						onClick={() => {
							setInput("");
							setResults(null);
							setError(null);
						}}
						disabled={loading}
					>
						Clear
					</button>
				</div>
				{(loading || (results && !loading) || error) && (
					<div aria-live="polite" className="admin-results">
						{loading && <LoadingSpinner />}
						{results && !loading && (
							<AdminResults results={results} />
						)}
						{error && <ErrorMessage error={error} />}
					</div>
				)}
			</form>
			<MigrationTool />
		</main>
	);
}

function MigrationTool() {
	const [loading, setLoading] = useState(false);
	const [mode, setMode] = useState<"dry-run" | "commit" | "delete">(
		"dry-run",
	);

	type MigratedItem = {
		oldKey: string;
		newKey: string;
		emailIndexKey: string;
		copiedR2?: string[];
		updatedSignaturePaths?: Record<string, string | null>;
		deleted?: boolean;
		deletedR2?: string[];
	};
	type SkippedItem = { oldKey: string; reason: string };
	type MigrationReportType = {
		mode: string;
		totalScanned: number;
		migrated: MigratedItem[];
		skipped: SkippedItem[];
		totalMigrated: number;
		totalSkipped: number;
		skipReasons?: Record<string, number>;
		logs?: string[];
	};

	const [report, setReport] = useState<MigrationReportType | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleMigrate = async () => {
		setLoading(true);
		setReport(null);
		setError(null);
		try {
			const resp = await fetch(`/migrate-keys?mode=${mode}`, {
				method: "POST",
			});
			if (!resp.ok) {
				setError("Migration failed: " + (await resp.text()));
				setReport(null);
			} else {
				const data = await resp.json();
				setReport(data);
			}
		} catch {
			setError("Migration request failed.");
			setReport(null);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ marginTop: 24 }}>
			<div style={{ marginBottom: 8 }}>
				<label htmlFor="migration-mode">Migration mode: </label>
				<select
					id="migration-mode"
					value={mode}
					onChange={e =>
						setMode(
							e.target.value as "dry-run" | "commit" | "delete",
						)
					}
					disabled={loading}
				>
					<option value="dry-run">Dry Run (no changes)</option>
					<option value="commit">Commit (migrate data)</option>
					<option value="delete">Delete (remove old keys)</option>
				</select>
			</div>
			<button
				type="button"
				onClick={handleMigrate}
				disabled={loading}
				style={{
					background: loading
						? "#ccc"
						: mode === "delete"
						? "#c0392b"
						: mode === "commit"
						? "#27ae60"
						: "#e67e22",
					color: "#fff",
					padding: "8px 16px",
					borderRadius: 4,
				}}
			>
				{loading ? `Running ${mode}...` : `Run Migration (${mode})`}
			</button>
			<div style={{ marginTop: 16 }}>
				{error && (
					<div style={{ color: "red", marginBottom: 8 }}>{error}</div>
				)}
				{report && <MigrationReport report={report} />}
			</div>
		</div>
	);
}

function MigrationReport({ report }: { report: MigrationReportType }) {
	return (
		<div
			style={{
				maxHeight: 400,
				overflow: "auto",
				background: "#fafafa",
				border: "1px solid #eee",
				padding: 12,
				borderRadius: 6,
			}}
		>
			<h4 style={{ marginTop: 0 }}>Migration Report</h4>
			<div>
				<b>Mode:</b> {report.mode}
			</div>
			<div>
				<b>Total Scanned:</b> {report.totalScanned}
			</div>
			<div>
				<b>Total Migrated:</b> {report.totalMigrated}
			</div>
			<div>
				<b>Total Skipped:</b> {report.totalSkipped}
			</div>
			{report.skipReasons && (
				<div style={{ margin: "8px 0" }}>
					<b>Skip Reasons:</b>
					<ul style={{ margin: 0, paddingLeft: 20 }}>
						{Object.entries(report.skipReasons).map(
							([reason, count]) => (
								<li key={reason}>
									{reason}: {Number(count)}
								</li>
							),
						)}
					</ul>
				</div>
			)}
			{Array.isArray(report.logs) && report.logs.length > 0 && (
				<details style={{ marginTop: 8 }}>
					<summary style={{ cursor: "pointer" }}>
						Show Logs ({report.logs.length})
					</summary>
					<pre
						style={{
							fontSize: 12,
							whiteSpace: "pre-wrap",
							margin: 0,
						}}
					>
						{report.logs.join("\n")}
					</pre>
				</details>
			)}
			{Array.isArray(report.migrated) && report.migrated.length > 0 && (
				<details style={{ marginTop: 8 }}>
					<summary style={{ cursor: "pointer" }}>
						Show Migrated ({report.migrated.length})
					</summary>
					<pre
						style={{
							fontSize: 12,
							whiteSpace: "pre-wrap",
							margin: 0,
						}}
					>
						{JSON.stringify(report.migrated, null, 2)}
					</pre>
				</details>
			)}
			{Array.isArray(report.skipped) && report.skipped.length > 0 && (
				<details style={{ marginTop: 8 }}>
					<summary style={{ cursor: "pointer" }}>
						Show Skipped ({report.skipped.length})
					</summary>
					<pre
						style={{
							fontSize: 12,
							whiteSpace: "pre-wrap",
							margin: 0,
						}}
					>
						{JSON.stringify(report.skipped, null, 2)}
					</pre>
				</details>
			)}
		</div>
	);
}

export default Admin;
