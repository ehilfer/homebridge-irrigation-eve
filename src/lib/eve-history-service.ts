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

  constructor(private historyType: string, private accessory: AccessoryPlugin, private api: API, private logger: Logging) {
    const FakeGatoHistoryService = fakegato(api);
    this.historyService = new FakeGatoHistoryService(historyType, this.accessory, { storage: 'fs', log: this.logger });
  }

  getService(): Service {
    return this.historyService as Service;
  }

  addEntry(entry: HistoryServiceEntry) {
    (this.historyService as HistoryService).addEntry(entry);
  }

}