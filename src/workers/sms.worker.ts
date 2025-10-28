import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { NOTIFICATION_QUEUES } from 'src/notification/notification.constants';
import {
  NotificationPayload,
  NotificationService,
} from 'src/notification/notification.service';
import { SmsService } from 'src/sms/sms.service';

@Processor(NOTIFICATION_QUEUES.SMS, { concurrency: 10 })
export class SmsWorker extends WorkerHost {
  constructor(
    private readonly logger: PinoLogger,
    private readonly smsService: SmsService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<NotificationPayload>): Promise<any> {
    const result = await this.smsService.sendNotificationSms(job.data);

    await this.notificationService.publishSmsNotificationResult(result);
  }
}
