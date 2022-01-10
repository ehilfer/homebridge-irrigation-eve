import fakegato from 'fakegato-history';
import { AccessoryPlugin, API, Logging, Service } from 'homebridge';

export interface HistoryServiceEntry extends Record<string, number> {
  time: number;
}

export interface HistoryService {
  addEntry(entry: HistoryServiceEntry): void;
}

export interface HistoryServiceStorageReaderOptions {
  service: unknown;
  callback: (err: unknown, data: string) => void;
}

export interface HistoryServiceStorage {
  globalFakeGatoStorage: {
    read: (options: HistoryServiceStorageReaderOptions) => void;
  };
}

export class EveHistoryService {
  private readonly historyService: unknown;

  constructor(
    private historyType: string,
    private accessory: AccessoryPlugin,
    private api: API,
    private logger: Logging,
  ) {
      const FakeGatoHistoryService = fakegato(api);
      this.historyService = new FakeGatoHistoryService(
          historyType,
          this.accessory,
          { storage: 'fs', log: this.logger },
      );
  }

  public getService(): Service {
      return this.historyService as Service;
  }

  public addEntry(entry: HistoryServiceEntry) {
      (this.historyService as HistoryService).addEntry(entry);
  }

  public async readHistory(): Promise<HistoryServiceEntry[]> {
      const storage = ((this.api as unknown) as HistoryServiceStorage).globalFakeGatoStorage;

      if (!storage) {
          this.logger.debug('Failed to access globalFakeGatoStorage');
          return [];
      }

      this.logger.debug('Reading data from globalFakeGatoStorage ...');

      const thisAccessory = this.accessory;
      const logger = this.logger;

      return new Promise((resolve, reject) => {
          storage.read({
              service: this.historyService,
              callback: function (err, data) {
                  if (!err) {
                      if (data) {
                          try {
                              const accessoryName = 'name' in thisAccessory ? thisAccessory['name'] : thisAccessory;
                              logger.debug('read data from', accessoryName);
                              const jsonFile = typeof (data) === 'object' ? data : JSON.parse(data);
                              resolve(jsonFile.history as HistoryServiceEntry[]);
                          } catch (e) {
                              logger.debug('**ERROR fetching persisting data restart from zero - invalid JSON**', e);
                              reject([]);
                          }
                      }
                  } else {
                  // file don't exists
                      logger.debug('**ERROR fetching persisting data: file dont exists', err);
                      reject([]);
                  }
              }.bind(this),
          });

      });
  }
}
