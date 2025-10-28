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

export interface SMSSenderResponse {
  method: 'GET' | 'POST';
  url: string;
  requestPayload: Record<string, any>;
  requestHeaders: Record<string, any>;
  responseStatus: number;
  response: any;
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt: number;
  deliveredAt?: number | null;
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

  async send(msisdn: string, body: string): Promise<SMSSenderResponse> {
    const senderResponse: SMSSenderResponse = {
      method: 'POST',
      url: '',
      requestPayload: {},
      requestHeaders: {},
      responseStatus: 500,
      response: {},
      errorCode: null,
      errorMessage: null,
      sentAt: Date.now(),
      deliveredAt: null,
    };

    try {
      const url = `${this.config.baseUrl}/partner/smsmessaging/v2/outbound/tel:+88022900/requests`;
      senderResponse.url = url;

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
      senderResponse.requestPayload = payload;

      const config = this.getAuthHeaders();
      senderResponse.requestHeaders = config.headers;

      const response = await this.httpClient.post(url, payload, config);
      senderResponse.response = response.data ?? response.error;
      senderResponse.responseStatus = response.status;
      senderResponse.errorCode = response.error?.code ?? null;
      senderResponse.errorMessage = response.error?.message ?? null;

      if (response.status === 200) {
        senderResponse.deliveredAt = Date.now();
      }

      return senderResponse;
    } catch (error: any) {
      this.logger.error(error, 'Catch block error in Gp SMS Sender');

      return {
        method: 'POST',
        url: this.config.baseUrl,
        requestPayload: {},
        requestHeaders: {},
        responseStatus: 500,
        response: {},
        errorCode: error.code ?? 'EXCEPTION',
        errorMessage: error.message ?? 'Unexpected error',
        sentAt: Date.now(),
        deliveredAt: null,
      };
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
