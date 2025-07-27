import React from "react";

interface SelectInputProps
	extends React.SelectHTMLAttributes<HTMLSelectElement> {
	label: React.ReactNode;
	name: string;
	value: string;
	options: {
		value: string;
		label: string;
	}[];
	style?: React.CSSProperties;
}

function SelectInput({
	label,
	name,
	value,
	options,
	style,
	...rest
}: SelectInputProps) {
	return (
		<div className="form-group" style={style}>
			<label htmlFor={name}>{label}</label>
			<select id={name} name={name} value={value} {...rest}>
				<option value="">Select...</option>
				{options.map(({ label, value }) => (
					<option key={value} value={value}>
						{label}
					</option>
				))}
			</select>
		</div>
	);
}

export default SelectInput;
