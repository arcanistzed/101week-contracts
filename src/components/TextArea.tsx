import React from "react";

interface TextAreaProps
	extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
	label: React.ReactNode;
	name: string;
	value: string;
	style?: React.CSSProperties;
}

function TextArea({ label, name, value, style, ...rest }: TextAreaProps) {
	return (
		<div className="form-group" style={style}>
			<label htmlFor={name}>{label}</label>
			<textarea id={name} name={name} value={value} {...rest} />
		</div>
	);
}

export default TextArea;
