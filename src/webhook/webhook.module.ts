import { Module } from '@nestjs/common';
import { HttpClientModule } from 'src/common/http-client/http-client.module';
import { ProductModule } from 'src/product/product.module';
import { WebhookService } from './webhook.service';

@Module({
  imports: [HttpClientModule, ProductModule],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
