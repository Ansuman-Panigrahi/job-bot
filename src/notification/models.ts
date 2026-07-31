export interface ReportResult {
  html: string;
  filePath: string;
  fileName: string;
  jobCount: number;
  sources: string[];
  keywords?: string[];
  generatedAt: Date;
}

export interface NotificationProvider {
  name: string;
  sendNotification(report: ReportResult): Promise<boolean>;
}
