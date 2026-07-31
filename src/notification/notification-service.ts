import { config } from '../config/env';
import { logger } from '../utils/logger';
import { GmailProvider } from './gmail-provider';
import { NotificationProvider, ReportResult } from './models';

export class NotificationService {
  private providers: NotificationProvider[] = [];

  constructor() {
    if (config.emailEnabled) {
      this.providers.push(new GmailProvider());
    }
  }

  public async notifyAll(report: ReportResult): Promise<boolean> {
    if (!config.emailEnabled || this.providers.length === 0) {
      return false;
    }

    let anySuccess = false;
    for (const provider of this.providers) {
      const success = await provider.sendNotification(report);
      if (success) {
        anySuccess = true;
      }
    }
    return anySuccess;
  }
}
