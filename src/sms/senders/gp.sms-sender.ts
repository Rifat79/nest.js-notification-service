import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { HttpClientService } from 'src/common/http-client/http-client.service';
import { ISmsSender } from './sms-sender.interface';

interface Config {
  baseUrl: string;
  auth: {
    username: string;
    password: string;
  };
  timeout: number;
}

@Injectable()
export class GpSmsSender implements ISmsSender {
  private readonly config: Config;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly httpClient: HttpClientService,
  ) {
    this.config = {
      baseUrl: this.configService.get('GP_BASE_URL') ?? '',
      auth: {
        username: this.configService.get('GP_BASIC_AUTH_USER') ?? '',
        password: this.configService.get('GP_BASIC_AUTH_PASS') ?? '',
      },
      timeout: this.configService.get('GP_TIMEOUT') ?? 5000,
    };
  }

  async send(msisdn: string, body: string): Promise<any> {
    try {
      const url = `${this.config.baseUrl}/partner/smsmessaging/v2/outbound/tel:+88022900/requests`;

      const payload = {
        outboundSMSMessageRequest: {
          address: `tel:+${msisdn}`,
          senderAddress: 'tel:+88022900',
          outboundSMSTextMessage: {
            message: body,
          },
          senderName: 'GP DOB',
          messageType: 'ARN',
        },
      };

      const response = await this.httpClient.post(
        url,
        payload,
        this.getAuthHeaders(),
      );

      return response;
    } catch (error) {
      this.logger.error(error, 'Catch block error in Gp SMS Sender');
    }
  }

  private getAuthHeaders() {
    const credentials = `${this.config.auth.username}:${this.config.auth.password}`;
    const encoded = Buffer.from(credentials).toString('base64');

    return {
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      timeout: this.config.timeout,
    };
  }
}
