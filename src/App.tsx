import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Form from "./components/Form";
import PDFPreview from "./components/PDFPreview";
import Logo from "./assets/ESS Logo.svg";

function App() {
	const { i18n, t } = useTranslation();
	const [language, setLanguage] = useState<"en" | "fr">(
		(i18n.language as "en" | "fr") || "en",
	);

	const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const lang = e.target.value as "en" | "fr";
		i18n.changeLanguage(lang);
		setLanguage(lang);
	};

	useEffect(() => {
		document.title = t("meta.title");
		document
			.querySelector('meta[name="description"]')
			?.setAttribute("content", t("meta.description"));
		document
			.querySelector('meta[property="og:title"]')
			?.setAttribute("content", t("meta.title"));
		document
			.querySelector('meta[property="og:description"]')
			?.setAttribute("content", t("meta.description"));
		document
			.querySelector('meta[name="twitter:title"]')
			?.setAttribute("content", t("meta.title"));
		document
			.querySelector('meta[name="twitter:description"]')
			?.setAttribute("content", t("meta.description"));
	}, [t]);

	return (
		<div className="app">
			<header className="header">
				<img src={Logo} alt="ESS Logo" height={50} />
				<h1>{t("title")}</h1>
				<select
					id="language-select"
					onChange={handleLanguageChange}
					value={language}
				>
					<option value="en">English</option>
					<option value="fr">Français</option>
				</select>
			</header>

			<main className="main">
				<Form />
				<PDFPreview language={language} />
			</main>
		</div>
	);
}

export default App;
