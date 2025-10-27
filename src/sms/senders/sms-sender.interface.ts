export interface ISmsSender {
  send(msisdn: string, body: string): Promise<any>;
}
