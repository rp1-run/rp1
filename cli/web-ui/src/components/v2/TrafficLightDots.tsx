export interface TrafficLightDotsProps {
	className?: string;
}

export function TrafficLightDots({ className }: TrafficLightDotsProps) {
	return (
		<div
			className={`flex items-center gap-1.5${className ? ` ${className}` : ""}`}
			aria-hidden="true"
		>
			<span className="h-2 w-2 rounded-full bg-terminal-red" />
			<span className="h-2 w-2 rounded-full bg-terminal-yellow" />
			<span className="h-2 w-2 rounded-full bg-terminal-green" />
		</div>
	);
}
