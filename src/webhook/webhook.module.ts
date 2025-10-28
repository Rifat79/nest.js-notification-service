import { Module } from '@nestjs/common';
import { HttpClientModule } from 'src/common/http-client/http-client.module';
import { ProductModule } from 'src/product/product.module';
import { WebhookResultScheduler } from 'src/schedulers/webhook-result.scheduler';
import { WebhookService } from './webhook.service';

@Module({
  imports: [HttpClientModule, ProductModule],
  providers: [WebhookService, WebhookResultScheduler],
  exports: [WebhookService],
})
export class WebhookModule {}
