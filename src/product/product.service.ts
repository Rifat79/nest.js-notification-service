import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from 'src/common/redis/redis.service';
import { ProductRepository } from 'src/database/product.repository';

export interface WebhookConfig {
  billing_notify_url: string;
  unsubscription_notify_url: string;
  method: 'POST' | 'GET';
  auth_user?: string;
  auth_password?: string;
  hasAuth: boolean;
}

export interface WebhookConfigResult {
  merchantId: number;
  productId: number;
  url: string;
  method: 'POST' | 'GET';
  hasAuth: boolean;
  auth_user?: string;
  auth_password?: string;
}

@Injectable()
export class ProductService {
  private readonly CACHE_TTL = 15 * 60; // 15 minutes

  constructor(
    private readonly productRepo: ProductRepository,
    private readonly redis: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ProductService.name);
  }

  async getWebhookConfig(
    keyword: string,
    event: string,
  ): Promise<WebhookConfigResult> {
    const cacheKey = `product:webhook_config:${keyword}:${event}`;

    try {
      // ✅ 1. Try cache first
      const cached = (await this.redis.get(cacheKey)) as WebhookConfigResult;
      if (cached) {
        this.logger.debug({ keyword }, 'Webhook config loaded from cache');
        return cached;
      }

      // ✅ 2. Fallback to database
      const product = await this.productRepo.findByKeyword(keyword);
      if (!product) {
        this.logger.warn({ keyword }, 'Product not found');
        throw new NotFoundException(
          `Product not found for keyword: ${keyword}`,
        );
      }

      const webhookConfig = product.notification_config as WebhookConfig | null;
      if (!webhookConfig) {
        this.logger.warn({ keyword }, 'No webhook config found for product');
        throw new NotFoundException(
          `No notification config for product: ${keyword}`,
        );
      }

      webhookConfig.hasAuth =
        !!webhookConfig.auth_user && !!webhookConfig.auth_password;

      const configResult = {
        url:
          event === 'unsubscription.success' || event === 'unsubscription.fail'
            ? webhookConfig.unsubscription_notify_url
            : webhookConfig.billing_notify_url,
        method: webhookConfig.method,
        hasAuth: webhookConfig.hasAuth,
        auth_user: webhookConfig.auth_user,
        auth_password: webhookConfig.auth_password,
        merchantId: product.merchant_id,
        productId: product.id,
      };

      // ✅ 3. Cache it for subsequent calls
      await this.redis.set(
        cacheKey,
        JSON.stringify(configResult),
        this.CACHE_TTL,
      );

      this.logger.info(
        {
          keyword,
          billing_notify_url: webhookConfig.billing_notify_url,
          unsubscription_notify_url: webhookConfig.unsubscription_notify_url,
          method: webhookConfig.method,
          hasAuth: webhookConfig.hasAuth,
        },
        'Fetched webhook configuration from DB and cached it',
      );

      return configResult;
    } catch (error) {
      this.logger.error(
        { keyword, error: error.message, stack: error.stack },
        'Failed to fetch webhook configuration',
      );
      throw error;
    }
  }
}
