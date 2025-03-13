import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom, of } from 'rxjs';
import { AxiosError } from 'axios';
import { Query, QueryResult } from './types';
import { logger } from 'src/config/logging';
import { CONFIG_KEY, ConfigType } from 'src/config/config';

@Injectable()
export class DataService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(CONFIG_KEY)
    private readonly config: ConfigType,
    private readonly dataService: HttpService,
  ) {}

  async get<T>(
    path: string,
    expire: number = this.config.CPLN_CACHE_SECONDS,
    bypassCache: boolean = false,
  ): Promise<T | null> {
    let obj: T | null;

    // get object from cache
    if (!bypassCache) {
      obj = await this.cacheManager.get<T>(path);
      if (obj) return obj;
    }

    // get obj from data service
    const response = await firstValueFrom(
      this.dataService.get<T>(path).pipe(
        catchError((error: AxiosError) => {
          console.log(error);
          if (error.response?.status === 404) {
            return of(null);
          }
          Logger.error(error.message);
          throw new Error('Failed to fetch data from data service');
        }),
      ),
    );

    if (response === null) {
      return null;
    }

    obj = response.data;

    // cache obj
    await this.cacheManager.set(path, obj, expire);

    return obj;
  }

  async put<T, R>(path: string, data: T): Promise<R> {
    const response = await firstValueFrom(
      this.dataService.put<R, T>(path, data).pipe(
        catchError((error: AxiosError) => {
          Logger.error(`Failed to put cpln object: ${error.message}`);
          throw error;
        }),
      ),
    );
    await this.cacheManager.del(path);

    return response.data;
  }

  async query<T>(path: string, query: Query): Promise<T[]> {
    const response = await firstValueFrom(
      this.dataService.post<QueryResult<T>>(path, query).pipe(
        catchError((error: AxiosError) => {
          logger.error(
            { err: error },
            `Failed to POST cpln object: ${error.message}`,
          );
          throw error;
        }),
      ),
    );

    return response.data.items;
  }

  async delete(path: string): Promise<void> {
    await firstValueFrom(
      this.dataService.delete(path).pipe(
        catchError((error: AxiosError) => {
          Logger.error(`Failed to delete cpln object: ${error.message}`);
          throw error;
        }),
      ),
    );
    await this.cacheManager.del(path);
  }
}
