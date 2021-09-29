import { Service, Logging, AccessoryConfig, API, AccessoryPlugin, HAP, CharacteristicValue } from 'homebridge';
import { EveHistoryService, HistoryServiceEntry } from './lib/eve-history-service';
import { HttpService, AutomationReturn } from './lib/http-service';

let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('homebridge-irrigation-eve', 'VirtualIrrigationEve', CHThermostatAccessory);
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class CHThermostatAccessory implements AccessoryPlugin {
  private readonly name: string;
  private readonly irrigationService: Service;
  private readonly serviceInfo: Service;
  private readonly httpPort: number;

  private readonly historyService: EveHistoryService;
  private readonly httpService: HttpService;

  constructor(
    private logger: Logging, private config: AccessoryConfig, private api: API) {

    hap = api.hap;

    // extract name from config
    this.name = config.name;
    this.httpPort = this.config.httpPort || 5678;


    // Set AccessoryInformation
    this.serviceInfo = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Virtual Irrigation Eve')
      .setCharacteristic(hap.Characteristic.Name, this.name);

    // create a new Thermostat service
    this.irrigationService = new hap.Service.(this.name);

    // create handlers for required characteristics
    this.historyService = new EveHistoryService('aqua', this, this.api, this.logger);

    this.httpService = new HttpService(this.httpPort, this.logger);
    this.httpService.start((fullPath: string) => this.httpHandler(fullPath));

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
    return [
      this.serviceInfo,
      this.irrigationService,
      this.historyService.getService(),
    ];
  }

}
