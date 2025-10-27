import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { NotificationPayload } from 'src/notification/notification.service';
import { GpSmsSender } from './senders/gp.sms-sender';
import { SmsTemplateService } from './sms-template.service';

@Injectable()
export class SmsService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly gpSender: GpSmsSender,
    private readonly templateService: SmsTemplateService,
  ) {}

  async sendNotificationSms(payload: NotificationPayload): Promise<void> {
    const { msisdn, eventType, paymentProvider } = payload;

    try {
      const template = this.templateService.getTemplate(
        eventType,
        paymentProvider,
      );

      const messageBody = this.templateService.populateTemplate(template, {
        amount: '5.00',
      });

      switch (paymentProvider) {
        case 'GP':
          await this.gpSender.send(msisdn, messageBody);
          break;

        default:
          this.logger.error(
            `Sms is not configured for operator: ${paymentProvider}`,
          );
          break;
      }
    } catch (error) {
      this.logger.error(error, 'Catch block error in sendNotificationSms');
    }
  }
}
