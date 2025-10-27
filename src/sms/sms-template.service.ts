import { Injectable } from '@nestjs/common';

@Injectable()
export class SmsTemplateService {
  getTemplate(eventType: string, operator: string): string {
    return `sample${eventType}:${operator} template`;
  }

  populateTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    let populatedTemplate = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      populatedTemplate = populatedTemplate.replace(
        new RegExp(placeholder, 'g'),
        value,
      );
    }
    return populatedTemplate;
  }
}
