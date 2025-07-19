import { useEffect, useState, useRef } from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import "@react-pdf-viewer/core/lib/styles/index.css";

interface PDFPreviewProps {
	language: string;
}

function PDFPreview({ language }: PDFPreviewProps) {
	const pdfUrl = `/101er Contract 2025 ${
		language.toLowerCase().startsWith("fr") ? "FR" : "EN"
	}.pdf`;

	const [viewerKey, setViewerKey] = useState(0);
	const lastWidth = useRef(window.innerWidth);

	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth !== lastWidth.current) {
				lastWidth.current = window.innerWidth;
				setViewerKey(k => k + 1);
			}
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	return (
		<div className="preview">
			<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
				<Viewer key={viewerKey} fileUrl={pdfUrl} />
			</Worker>
		</div>
	);
}

export default PDFPreview;
