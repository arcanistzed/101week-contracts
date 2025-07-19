import React from "react";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	label: React.ReactNode;
	name: string;
	value: string;
	style?: React.CSSProperties;
}

function TextInput({ label, name, value, style, ...rest }: TextInputProps) {
	return (
		<div className="form-group" style={style}>
			<label htmlFor={name}>{label}</label>
			<input id={name} name={name} value={value} {...rest} />
		</div>
	);
}

export default TextInput;
