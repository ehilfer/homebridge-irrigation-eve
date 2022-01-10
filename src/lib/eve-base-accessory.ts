import {
    Logging,
    AccessoryConfig,
    API,
    Characteristic,
    Service,
    AccessoryPlugin,
    CharacteristicValue,
} from 'homebridge';

import { EveHistoryService } from './eve-history-service';

import EveGetConfiguration = require('./eve-get-configuration');
import EveSetConfiguration = require('./eve-set-configuration');

import { callbackify } from './homebridge-callbacks';

let EveGetConfigurationType;
let EveSetConfigurationType;

export abstract class EveBaseAccessory {
  protected readonly Characteristic: typeof Characteristic &
    typeof EveGetConfigurationType &
    typeof EveSetConfigurationType = this.api.hap.Characteristic;

  protected readonly EveGetConfiguration;
  protected readonly EveSetConfiguration;

  protected readonly historyService: EveHistoryService;

  constructor(
    protected api: API,
    protected config: AccessoryConfig,
    protected logger: Logging,
  ) {
      this.EveGetConfiguration = EveGetConfiguration(api);
      EveGetConfigurationType = this.EveGetConfiguration;

      this.Characteristic = Object.defineProperty(
          this.api.hap.Characteristic,
          'EveGetConfiguration',
          { value: this.EveGetConfiguration },
      );

      this.EveSetConfiguration = EveSetConfiguration(api);
      EveSetConfigurationType = this.EveSetConfiguration;

      this.Characteristic = Object.defineProperty(
          this.api.hap.Characteristic,
          'EveSetConfiguration',
          { value: this.EveSetConfiguration },
      );

      this.historyService = new EveHistoryService(
          this.getAccessoryType(),
          this.getAccessory(),
          this.api,
          this.logger,
      );
  }

  protected configureEveCharacteristics(service: Service) {
      service.addCharacteristic(this.Characteristic.EveGetConfiguration);
      service
          .getCharacteristic(this.Characteristic.EveGetConfiguration)
          .on('get', callbackify(this.getEveConfiguration.bind(this)));

      service.addCharacteristic(this.Characteristic.EveSetConfiguration);
      service
          .getCharacteristic(this.Characteristic.EveSetConfiguration)
          .on('set', callbackify(this.setEveConfiguration.bind(this)));
  }

  protected abstract getEveConfiguration(): Promise<string>;
  protected abstract setEveConfiguration(value: CharacteristicValue): Promise<boolean>;
  protected abstract getAccessoryType(): string;

  protected abstract getAccessory(): AccessoryPlugin;

  protected getEveServices(): Service[] {
      return [this.historyService.getService()];
  }
}
