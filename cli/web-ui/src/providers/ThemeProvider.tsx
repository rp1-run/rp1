import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
	systemPreference: Theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "rp1-ui-theme";

function getSystemPreference(): Theme {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getSavedTheme(): Theme | null {
	if (typeof window === "undefined") return null;
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === "light" || saved === "dark") {
			return saved;
		}
	} catch {
		// ignore
	}
	return null;
}

function saveTheme(theme: Theme): void {
	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// ignore
	}
}

function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	root.classList.remove("light", "dark");
	root.classList.add(theme);
}

interface ThemeProviderProps {
	children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
	const [systemPreference, setSystemPreference] = useState<Theme>(() =>
		getSystemPreference(),
	);

	const [theme, setThemeState] = useState<Theme>(() => {
		const saved = getSavedTheme();
		if (saved) return saved;
		return getSystemPreference();
	});

	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		const handleChange = (e: MediaQueryListEvent) => {
			const newPreference = e.matches ? "dark" : "light";
			setSystemPreference(newPreference);

			if (!getSavedTheme()) {
				setThemeState(newPreference);
			}
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		saveTheme(newTheme);
	}, []);

	const toggleTheme = useCallback(() => {
		setThemeState((current) => {
			const newTheme = current === "dark" ? "light" : "dark";
			saveTheme(newTheme);
			return newTheme;
		});
	}, []);

	return (
		<ThemeContext.Provider
			value={{ theme, setTheme, toggleTheme, systemPreference }}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
