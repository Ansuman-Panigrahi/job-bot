import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { NotificationProvider, ReportResult } from './models';

export class GmailProvider implements NotificationProvider {
  public readonly name = 'Gmail';

  public async sendNotification(report: ReportResult): Promise<boolean> {
    const user = config.gmailUser || config.emailFrom;
    const pass = (config.gmailAppPassword || '').replace(/"/g, '').trim();
    const rawTo = config.emailTo || user;
    const to = rawTo
      .split(',')
      .map((addr) => addr.trim())
      .filter(Boolean)
      .join(', ');

    if (!user || !pass) {
      logger.warn('Gmail notification skipped: GMAIL_USER or GMAIL_APP_PASSWORD is missing in .env.');
      return false;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    });

    const formattedDate = report.generatedAt.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const sourcesStr = report.sources.length > 0 ? report.sources.join(', ') : 'Naukri';
    const keywordsStr = report.keywords && report.keywords.length > 0 ? report.keywords.join(', ') : '';

    const subject = keywordsStr
      ? `🚀 ${report.jobCount} New Jobs Found (${keywordsStr}) | ${sourcesStr} | ${formattedDate}`
      : `🚀 ${report.jobCount} New Jobs Found | ${sourcesStr} | ${formattedDate}`;

    const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #24292f; background-color: #ffffff; border: 1px solid #e1e4e8; border-radius: 8px;">
      <h2 style="color: #0969da; margin-top: 0; font-size: 20px;">New Jobs Found</h2>
      <p style="font-size: 15px; line-height: 1.5; color: #57606a;">
        <strong>${report.jobCount}</strong> new matching job${report.jobCount === 1 ? '' : 's'} were discovered.
      </p>
      
      <div style="background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${keywordsStr ? `
          <tr>
            <td style="padding: 4px 0; color: #57606a; font-weight: 600; width: 140px;">Search Keywords:</td>
            <td style="padding: 4px 0; color: #0969da; font-weight: 600;">${this.escapeHtml(keywordsStr)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 4px 0; color: #57606a; font-weight: 600; width: 140px;">New Jobs:</td>
            <td style="padding: 4px 0; color: #24292f; font-weight: 600;">${report.jobCount}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #57606a; font-weight: 600;">Search Source:</td>
            <td style="padding: 4px 0; color: #24292f;">${this.escapeHtml(sourcesStr)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #57606a; font-weight: 600;">Generated At:</td>
            <td style="padding: 4px 0; color: #24292f;">${formattedDate}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 14px; color: #57606a; margin-bottom: 24px;">
        The detailed HTML report (<code>${report.fileName}</code>) is attached to this email.
      </p>

      <div style="border-top: 1px solid #e1e4e8; padding-top: 16px; font-size: 14px; color: #0969da; font-weight: 600;">
        Happy Job Hunting 🚀
      </div>
    </div>`;

    const mailOptions: nodemailer.SendMailOptions = {
      from: config.emailFrom || user,
      to,
      subject,
      html: htmlBody,
      attachments: [
        {
          filename: report.fileName,
          path: report.filePath,
        },
      ],
    };

    try {
      await transporter.sendMail(mailOptions);
      return true;
    } catch (firstError: any) {
      logger.warn(`Email delivery attempt 1 failed: ${firstError.message}. Retrying in 5 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        await transporter.sendMail(mailOptions);
        return true;
      } catch (retryError: any) {
        logger.error(`Notification Failed\nReason: ${retryError.message}`);
        return false;
      }
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
