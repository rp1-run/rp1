import type { EventType, Run, RunEvent } from "../types/runs";

export interface DownsamplingConfig {
	readonly thresholdHours: number;
	readonly preserveTypes: readonly EventType[];
}

export interface CompressedEvents {
	readonly events: readonly RunEvent[];
	readonly originalCount: number;
	readonly compressionRatio: number;
}

interface EventAggregate {
	readonly type: EventType;
	readonly count: number;
	readonly firstTimestamp: string;
	readonly lastTimestamp: string;
}

const DEFAULT_PRESERVE_TYPES: readonly EventType[] = [
	"status_change",
	"waiting_for_user",
];

const AGGREGATABLE_TYPES: readonly EventType[] = [
	"btw_update",
	"artifact_registered",
];

export class DownsamplingService {
	private readonly config: DownsamplingConfig;

	constructor(config?: Partial<DownsamplingConfig>) {
		this.config = {
			thresholdHours: config?.thresholdHours ?? 24,
			preserveTypes: config?.preserveTypes ?? DEFAULT_PRESERVE_TYPES,
		};
	}

	shouldDownsample(run: Run): boolean {
		if (
			run.status !== "completed" &&
			run.status !== "failed" &&
			run.status !== "cancelled" &&
			run.status !== "abandoned"
		) {
			return false;
		}

		if (!run.completedAt) {
			return false;
		}

		const completedTime = new Date(run.completedAt).getTime();
		const now = Date.now();
		const thresholdMs = this.config.thresholdHours * 60 * 60 * 1000;

		return now - completedTime > thresholdMs;
	}

	downsampleEvents(events: readonly RunEvent[]): CompressedEvents {
		if (events.length === 0) {
			return {
				events: [],
				originalCount: 0,
				compressionRatio: 1,
			};
		}

		const preserved: RunEvent[] = [];
		const aggregates = new Map<EventType, EventAggregate>();

		for (const event of events) {
			if (this.shouldPreserveEvent(event)) {
				preserved.push(event);
			} else if (this.isAggregatableEvent(event)) {
				const existing = aggregates.get(event.type);
				if (existing) {
					aggregates.set(event.type, {
						...existing,
						count: existing.count + 1,
						lastTimestamp: event.timestamp,
					});
				} else {
					aggregates.set(event.type, {
						type: event.type,
						count: 1,
						firstTimestamp: event.timestamp,
						lastTimestamp: event.timestamp,
					});
				}
			}
		}

		const summaryEvents = this.createSummaryEvents(aggregates);
		const allEvents = this.mergeEventsByTimestamp(preserved, summaryEvents);

		const originalCount = events.length;
		const compressedCount = allEvents.length;
		const compressionRatio =
			originalCount > 0 ? compressedCount / originalCount : 1;

		return {
			events: allEvents,
			originalCount,
			compressionRatio,
		};
	}

	getEventsForRun(run: Run): CompressedEvents {
		if (!this.shouldDownsample(run)) {
			return {
				events: run.events,
				originalCount: run.events.length,
				compressionRatio: 1,
			};
		}

		return this.downsampleEvents(run.events);
	}

	private shouldPreserveEvent(event: RunEvent): boolean {
		if (this.config.preserveTypes.includes(event.type)) {
			return true;
		}

		if (event.type === "waiting_for_user") {
			return true;
		}

		return false;
	}

	private isAggregatableEvent(event: RunEvent): boolean {
		return AGGREGATABLE_TYPES.includes(event.type);
	}

	private createSummaryEvents(
		aggregates: Map<EventType, EventAggregate>,
	): RunEvent[] {
		const summaryEvents: RunEvent[] = [];

		for (const [type, aggregate] of aggregates) {
			if (aggregate.count > 0) {
				const typeLabel = this.formatEventTypeLabel(type);
				summaryEvents.push({
					id: `summary-${type}-${aggregate.firstTimestamp}`,
					type,
					message: `${aggregate.count} ${typeLabel} event${aggregate.count === 1 ? "" : "s"} compressed`,
					timestamp: aggregate.lastTimestamp,
					stepId: null,
					metadata: {
						isSummary: true,
						originalCount: aggregate.count,
						firstTimestamp: aggregate.firstTimestamp,
						lastTimestamp: aggregate.lastTimestamp,
					},
				});
			}
		}

		return summaryEvents;
	}

	private formatEventTypeLabel(type: EventType): string {
		switch (type) {
			case "btw_update":
				return "update";
			case "artifact_registered":
				return "artifact";
			default:
				return type;
		}
	}

	private mergeEventsByTimestamp(
		preserved: readonly RunEvent[],
		summaries: readonly RunEvent[],
	): RunEvent[] {
		const all = [...preserved, ...summaries];
		return all.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
	}

	updateConfig(config: Partial<DownsamplingConfig>): DownsamplingService {
		return new DownsamplingService({
			...this.config,
			...config,
		});
	}

	getConfig(): DownsamplingConfig {
		return this.config;
	}
}

export function createDownsamplingService(
	thresholdHours?: number,
): DownsamplingService {
	return new DownsamplingService(
		thresholdHours !== undefined ? { thresholdHours } : undefined,
	);
}
