export interface ReportResult {
  html: string;
  filePath: string;
  fileName: string;
  jobCount: number;
  sources: string[];
  keywords?: string[];
  generatedAt: Date;
  topMatches?: {
    title: string;
    company: string;
    score: number;
    url: string;
  }[];
}

export interface NotificationProvider {
  name: string;
  sendNotification(report: ReportResult): Promise<boolean>;
}
