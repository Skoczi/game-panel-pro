export type OperationProgress = { stage: string; message: string; percent: number | null };
export type ReportProgress = (progress: OperationProgress) => Promise<void>;
