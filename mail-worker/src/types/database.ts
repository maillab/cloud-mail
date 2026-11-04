/** Raw D1 aggregate results; these are not the chart response DTOs. */
export interface AnalysisNumberCountRow {
	receiveTotal: number;
	sendTotal: number;
	delReceiveTotal: number;
	delSendTotal: number;
	normalReceiveTotal: number;
	normalSendTotal: number;
	userTotal: number;
	normalUserTotal: number;
	delUserTotal: number;
	accountTotal: number;
	normalAccountTotal: number;
	delAccountTotal: number;
}

export interface AnalysisDayCountRow {
	// SQLite DATE() returns NULL for malformed historical timestamp text.
	date: string | null;
	total: number;
}
