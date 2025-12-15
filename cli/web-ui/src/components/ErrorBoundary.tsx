import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null, errorInfo: null };
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		this.setState({ errorInfo });
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null, errorInfo: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex flex-col items-center justify-center min-h-[200px] p-6 rounded-lg border border-destructive/30 bg-destructive/5">
					<AlertTriangle className="h-10 w-10 text-destructive mb-4" />
					<h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
					<p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
						An error occurred while rendering this component. You can try
						refreshing or going back.
					</p>
					{this.state.error && (
						<details className="w-full max-w-lg mb-4">
							<summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
								Error details
							</summary>
							<pre className="mt-2 p-3 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap">
								{this.state.error.message}
								{this.state.errorInfo?.componentStack && (
									<>
										{"\n\nComponent Stack:"}
										{this.state.errorInfo.componentStack}
									</>
								)}
							</pre>
						</details>
					)}
					<div className="flex gap-2">
						<Button variant="outline" size="sm" onClick={this.handleReset}>
							<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
							Try again
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => window.location.reload()}
						>
							Reload page
						</Button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
