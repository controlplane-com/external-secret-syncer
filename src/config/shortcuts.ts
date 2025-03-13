import { Inject, Injectable } from '@nestjs/common';
import { CONFIG_KEY, ConfigType } from './config';

@Injectable()
export class Shortcuts {
  constructor(@Inject(CONFIG_KEY) private config: ConfigType) {}

  get wokloadShortLink(): string {
    return '/' + this.config.CPLN_WORKLOAD.split('/').slice(3).join('/');
  }
}
