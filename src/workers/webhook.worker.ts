import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { NOTIFICATION_QUEUES } from 'src/notification/notification.constants';
import {
  NotificationPayload,
  NotificationService,
} from 'src/notification/notification.service';
import { WebhookService } from 'src/webhook/webhook.service';

@Processor(NOTIFICATION_QUEUES.WEBHOOK, { concurrency: 20 })
export class SmsWorker extends WorkerHost {
  constructor(
    private readonly logger: PinoLogger,
    private readonly webhookService: WebhookService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<NotificationPayload>): Promise<any> {
    const result = await this.webhookService.sendWebhookNotification(job.data);

    await this.notificationService.publishWebhookNotificationResult(result);
  }
}
