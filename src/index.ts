import {
    Service,
    Logging,
    AccessoryConfig,
    API,
    AccessoryPlugin,
    HAP,
    CharacteristicValue,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
} from 'homebridge';
import { HttpService, AutomationReturn } from './lib/http-service';

import { EveAquaAccessory } from './lib/eve-aqua-accessory';

let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
    hap = api.hap;
    api.registerAccessory(
        'homebridge-irrigation-eve',
        'VirtualIrrigationEve',
        VirtualIrrigationAccessory,
    );
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class VirtualIrrigationAccessory
    extends EveAquaAccessory
    implements AccessoryPlugin {
  private readonly name: string;
  private readonly displayName: string;
  private readonly service: Service;
  private readonly serviceInfo: Service;
  private readonly httpPort: number;

  private readonly maxDuration = 3600;
  private readonly httpService: HttpService;

  private readonly humidifierService: Service;
  private readonly termperatureService: Service;

  // irrigation
  private remainingDuration: number;
  private fault: number;
  private duration: number;
  private countdownTimer!: NodeJS.Timeout;
  private duration: number;

  // humidifier
  private currentRelativeHumidity: number;
  private currentHumidifierDehumidifierState: number;
  private waterLevel: number;

  // teemperature
  private currentTemperature: number;

  constructor(logger: Logging, config: AccessoryConfig, api: API) {
      super(api, config, logger);
      hap = api.hap;

      // extract name from config
      this.name = config.name;
      this.displayName = this.name;
      this.httpPort = this.config.httpPort || 5678;
      this.remainingDuration = 0;
      this.duration = 3600;

      this.fault = 0;
      this.currentRelativeHumidity = 50;
      this.currentTemperature = 20;
      this.currentHumidifierDehumidifierState = hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
      this.waterLevel = 20;

      // Set AccessoryInformation
      this.serviceInfo = new hap.Service.AccessoryInformation()
          .setCharacteristic(
              hap.Characteristic.Manufacturer,
              'Virtual Irrigation Eve',
          )
          .setCharacteristic(hap.Characteristic.Name, this.name);

      this.service = new hap.Service.Valve(this.name);

      this.service
          .setCharacteristic(hap.Characteristic.ServiceLabelIndex, 0)
          .setCharacteristic(hap.Characteristic.ValveType, 1);

      this.service
          .getCharacteristic(hap.Characteristic.Active)
          .on('set', this.setActiveZone.bind(this));

      this.service
          .getCharacteristic(hap.Characteristic.RemainingDuration)
          .setProps({ maxValue: this.maxDuration })
          .on('get', this.zoneRemainingTime.bind(this));

      this.service
          .getCharacteristic(hap.Characteristic.StatusFault)
          .on('get', this.getFault.bind(this));

      this.service
          .getCharacteristic(hap.Characteristic.SetDuration)
          .setProps({ maxValue: this.duration })
          .on('set', this.setDuration.bind(this));
    
      // TODO: add support for ProgramMode characteristic to indicate chedueld or manual operation

      this.configureEveCharacteristics(this.service);

      // Humidifier service to track the rainbarrel level as tank level
      this.service = new hap.Service.humidifierService(this.name);

      this.service
          .getCharacteristic(hap.Characteristic.Active)
          .on('set', this.setActiveHumidifier.bind(this));

      this.service
          .getCharacteristic(hap.Characteristic.currentRelativeHumidity)
          .on('get', this.getCurrentRelativeHumidity.bind(this));

      this.service
          .getCharacteristic(hap.Characteristic.currentHumidifierDehumidifierState)
          .on('get', this.getCurrentHumidifierDehumidifierState.bind(this));

      this.service
          .getCharacteristic(hap.Characteristic.waterLevel)
          .on('get', this.waterLevel.bind(this));

      // Termperature service
      this.service = new hap.Service.termperatureService(this.name);

      this.service
          .getCharacteristic(hap.Characteristic.currentTemperature)
          .on('get', this.getCurrentTemperature.bind(this));


      // http service to receive status information
      this.httpService = new HttpService(this.httpPort, this.logger);
      this.httpService.start((fullPath: string) => this.httpHandler(fullPath));
  }

  setDuration(value: CharacteristicValue, callback: CharacteristicSetCallback) {
      this.logger.info(`Triggered SET Duration: ${value}`);
      this.duration = Number.parseInt(value.toString());
      callback();
  }

  setActiveHumidifier(
      value: CharacteristicValue,
      callback: CharacteristicSetCallback,
  ) {
      this.logger.info(`Triggered SET Active Humidifier: ${value}`);
      this.humidifierService.getCharacteristic(hap.Characteristic.InUse).updateValue(value);
      callback();
  }

  setActiveZone(
      value: CharacteristicValue,
      callback: CharacteristicSetCallback,
  ) {
      this.logger.info(`Triggered SET Active: ${value}`);
      this.service.getCharacteristic(hap.Characteristic.InUse).updateValue(value);
      if (value === 1) {
          this.remainingDuration = this.duration;
          this.logger.info(`Starting timer for: ${this.duration}s`);

          this.countdownTimer = setInterval(() => {
              this.remainingDuration = this.remainingDuration - 1; //duration in secs
              if (this.remainingDuration < 0) {
                  this.remainingDuration = 0;
                  clearInterval(this.countdownTimer);
              }
              this.updateRemainingTime();
          }, 1000);
      } else {
          this.remainingDuration = 0;
          clearInterval(this.countdownTimer);
          this.updateRemainingTime();
      }
      callback();
  }

  zoneRemainingTime(callback: CharacteristicGetCallback) {
      this.logger.info('Triggered GET Remaining Time ' + this.remainingDuration);
      callback(null, this.remainingDuration);
  }

  getFault(callback: CharacteristicGetCallback) {
      this.logger.info('Triggered GET Fault ' + this.fault);
      callback(null, this.fault);
  }

  getCurrentRelativeHUmidity(callback: CharacteristicGetCallback) {
      this.logger.info('Triggered GET CurrentRelativeHUmidity ' + this.currentRelativeHumidity);
      callback(null, this.currentRelativeHumidity);
  }

  getCurrentTemperature(callback: CharacteristicGetCallback) {
      this.logger.info('Triggered GET CurrentTemperature ' + this.currentTemperature);
      callback(null, this.currentTemperature);
  }

  getCurrentHumidifierDehumidifierState(callback: CharacteristicGetCallback) {
      this.logger.info('Triggered GET CurrentHumidifierDehumidifierState ' + this.currentHumidifierDehumidifierState);
      callback(null, this.fault);
  }

  getCurrentWaterLevel(callback: CharacteristicGetCallback) {
      this.logger.info('Triggered GET CurrentWaterLevel ' + this.waterLevel);
      callback(null, this.fault);
  }

  updateRemainingTime() {
      this.logger.info(`updateRemainingTime: ${this.remainingDuration}`);
      this.service
          .getCharacteristic(hap.Characteristic.RemainingDuration)
          .updateValue(this.remainingDuration);

      const wateringStatus = this.remainingDuration > 0 ? 1 : 0;
      if (wateringStatus === 0) {
          this.historyService.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: wateringStatus,
              waterAmount: 1000,
          });
      }
  }

  httpHandler(fullPath: string): AutomationReturn {
      this.logger.info('Received request: %s', fullPath);

      const parts = fullPath.split('/');

      if (parts.length < 2) {
          return {
              error: true,
              message: 'Malformed uri',
          };
      }

      //update irrigation zone watering status
      //uri example: /watering/1
      //usually due to HomeKit automation when original uri is /temp/22.5C

      // if (parts[1] === 'temp') {
      //   const tempParts = parts[2].split('%');
      //   if (tempParts.length > 0) {
      //     this.updateCurrentTemperature(parseFloat('' + tempParts[0]));

      //     const message = 'Updated accessory current temperature to: ' + this.currentTemp;
      //     this.logger.info(message);
      //     return {
      //       error: false,
      //       message: message,
      //     };
      //   }
      // }

      return {
          error: false,
          message: 'OK',
      };
  }

  getServices(): Service[] {
      return [this.serviceInfo, this.service, this.humidifierService, this.termperatureService, ...this.getEveServices()];
  }

  protected getAccessory(): AccessoryPlugin {
      return this;
  }
}
