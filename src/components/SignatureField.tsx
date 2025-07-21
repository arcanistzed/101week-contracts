import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SignaturePad from "signature_pad";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg"];

interface SignatureFieldProps {
	label: string;
	name: string;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	value: string;
}

function SignatureField({ label, name, onChange, value }: SignatureFieldProps) {
	const { t } = useTranslation();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const padRef = useRef<SignaturePad | null>(null);

	const [mode, setMode] = useState<"draw" | "upload" | "type">("draw");
	const [typedSignature, setTypedSignature] = useState("");
	const [uploadedImage, setUploadedImage] = useState<string>("");
	const [error, setError] = useState<string>("");

	const MAX_SIGNATURE_LENGTH = 40;
	const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB

	const resizeCanvas = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		canvas.width = canvas.offsetWidth * ratio;
		canvas.height = canvas.offsetHeight * ratio;
		canvas.getContext("2d")?.scale(ratio, ratio);
		padRef.current?.clear();
		if (value) {
			padRef.current?.fromDataURL(value);
		}
	}, [value]);

	const clearSignature = useCallback(() => {
		setError("");
		if (mode === "draw" && padRef.current) {
			padRef.current.clear();
			if (inputRef.current) {
				const event = {
					target: { name, value: "" },
				} as React.ChangeEvent<HTMLInputElement>;
				onChange(event);
			}
		} else if (mode === "upload") {
			setUploadedImage("");
			const event = {
				target: { name, value: "" },
			} as React.ChangeEvent<HTMLInputElement>;
			onChange(event);
		} else if (mode === "type") {
			setTypedSignature("");
			const event = {
				target: { name, value: "" },
			} as React.ChangeEvent<HTMLInputElement>;
			onChange(event);
		}
	}, [mode, onChange, name]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				clearSignature();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mode, clearSignature]);

	const handleEnd = useCallback(() => {
		if (padRef.current && inputRef.current) {
			const dataUrl = padRef.current.isEmpty()
				? ""
				: padRef.current.toDataURL();
			const event = {
				target: { name, value: dataUrl },
			} as React.ChangeEvent<HTMLInputElement>;
			onChange(event);
		}
	}, [name, onChange]);

const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
	setError("");
	const file = e.target.files?.[0];
	if (file) {
		if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
			setError(t("signature.errorTypeAllowed", { types: "PNG, JPEG" }));
			return;
		}
		if (file.size > MAX_IMAGE_SIZE) {
			setError(t("signature.errorSize", { size: "1MB" }));
			return;
		}
		const reader = new FileReader();
		reader.onload = ev => {
			const imgData = ev.target?.result as string;
			setUploadedImage(imgData);
			const event = {
				target: { name, value: imgData },
			} as React.ChangeEvent<HTMLInputElement>;
			onChange(event);
		};
		reader.readAsDataURL(file);
	}
};

const handleTypedSignature = (e: React.ChangeEvent<HTMLInputElement>) => {
	setError("");
	const val = e.target.value;
	if (val.length > MAX_SIGNATURE_LENGTH) {
		setError(t("signature.errorLength", { max: MAX_SIGNATURE_LENGTH }));
		return;
	}
	setTypedSignature(val);
	const event = {
		target: { name, value: val },
	} as React.ChangeEvent<HTMLInputElement>;
	onChange(event);
};

useEffect(() => {
	if (canvasRef.current) {
		padRef.current = new SignaturePad(canvasRef.current);
		padRef.current.addEventListener("endStroke", handleEnd);
		if (value) {
			padRef.current.fromDataURL(value);
		}
	}
	return () => {
		if (padRef.current) {
			padRef.current.off();
			padRef.current.removeEventListener("endStroke", handleEnd);
		}
		padRef.current = null;
	};
}, [handleEnd, value]);

useEffect(() => {
	if (padRef.current && value) {
		padRef.current.fromDataURL(value);
	}
}, [value]);

const prevMode = useRef<"draw" | "upload" | "type">(mode);
useEffect(() => {
	if (prevMode.current === "upload" && mode !== "upload") {
		setUploadedImage("");
	}
	if (mode === "draw") {
		if (canvasRef.current) {
			if (padRef.current) {
				padRef.current.off();
			}
			padRef.current = new SignaturePad(canvasRef.current);
			padRef.current.addEventListener("endStroke", handleEnd);
			resizeCanvas();
			if (value) {
				padRef.current.fromDataURL(value);
			}
		}
	}
	prevMode.current = mode;
}, [mode, handleEnd, resizeCanvas, value]);

return (
	<div className="form-group">
		<span>{label}</span>
		<div className="signature-container">
			{error && (
				<div aria-live="polite" className="signature-error">
					{error}
				</div>
			)}
			{mode === "draw" && (
				<>
					<canvas
						ref={canvasRef}
						className="signature-canvas"
						aria-label={t("signature.canvasAria")}
					/>
					<button
						type="button"
						onClick={clearSignature}
						className="signature-clear-button"
						title={t("signature.clear")}
					>
						&#x2715;
					</button>
					<input
						ref={inputRef}
						type="hidden"
						name={name}
						value={value}
						readOnly
					/>
				</>
			)}
			{mode === "upload" && (
				<div className="signature-upload-group">
					<input
						type="file"
						accept="image/png,image/jpeg"
						onChange={handleImageUpload}
						className="signature-input"
					/>
					{uploadedImage && (
						<>
							<img
								src={uploadedImage}
								alt={t("signature.preview")}
								className="signature-upload-preview"
							/>
							<button
								type="button"
								onClick={clearSignature}
								className="signature-clear-button"
								title={t("signature.clear")}
							>
								&#x2715;
							</button>
						</>
					)}
				</div>
			)}
			{mode === "type" && (
				<>
					<input
						type="text"
						placeholder={t("signature.typePlaceholder")}
						value={typedSignature}
						onChange={handleTypedSignature}
						name={name}
						id={name}
						maxLength={MAX_SIGNATURE_LENGTH}
						className="signature-type-input"
					/>
					{!!typedSignature && (
						<button
							type="button"
							onClick={clearSignature}
							className="signature-clear-button"
							title={t("signature.clear")}
						>
							&#x2715;
						</button>
					)}
				</>
			)}
		</div>
		<div className="signature-mode-group">
			<label
				htmlFor={`${name}-mode-draw`}
				className="signature-mode-label"
			>
				<input
					type="radio"
					id={`${name}-mode-draw`}
					checked={mode === "draw"}
					onChange={() => setMode("draw")}
				/>
				{t("signature.draw")}
			</label>
			<label
				htmlFor={`${name}-mode-upload`}
				className="signature-mode-label"
			>
				<input
					type="radio"
					id={`${name}-mode-upload`}
					checked={mode === "upload"}
					onChange={() => setMode("upload")}
				/>
				{t("signature.upload")}
			</label>
			<label
				htmlFor={`${name}-mode-type`}
				className="signature-mode-label"
			>
				<input
					type="radio"
					id={`${name}-mode-type`}
					checked={mode === "type"}
					onChange={() => setMode("type")}
				/>
				{t("signature.type")}
			</label>
		</div>
	</div>
);
}

export default SignatureField;
