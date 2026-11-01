export interface RequestState {
	replayDeadline?: number;
}

// Carry the dispatch deadline without adding metadata to public options or JSON responses.
const states = new WeakMap<object, RequestState>();

export function trackRequestState(options: object): RequestState {
	const state: RequestState = {};
	states.set(options, state);
	return state;
}

export function getRequestState(options: object): RequestState | undefined {
	return states.get(options);
}
