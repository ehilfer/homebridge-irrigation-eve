import {
    Logging,
    AccessoryConfig,
    API,
    Characteristic,
    AccessoryPlugin,
    CharacteristicValue,
} from 'homebridge';

import {
    numberToEveHexString,
    encodeEveData,
    decodeEveData,
    EveHexStringToNumber,
    EveHexStringToFloat,
} from './eve-utils';
import { format } from 'util';

import { EveBaseAccessory } from './eve-base-accessory';

let EveGetConfigurationType;
let EveSetConfigurationType;

const EPOCH_OFFSET = 978307200; // Seconds since 1/1/1970 to 1/1/2001

export interface EveProgramSchedule {
  type: string;
  offset: number;
  duration: number;
}

export interface EvePrograms {
  id: number;
  days: string[];
  schedule: EveProgramSchedule[];
}

export interface EveBasicConfig {
  timestamp?: number;
  utcoffset?: number;
  latitude?: number;
  longitude?: number;
  enabled?: boolean;
  programs?: EvePrograms[];
  command47?: string;
  days?: number;
  childlock?: boolean;
}

// Need some internal storage to track Eve Aqua configuration from EveHome app
export interface EveAquaConfig extends EveBasicConfig {
  // = optionalParams.hasOwnProperty("EveAqua_firmware") ? optionalParams.EveAqua_firmware : 1208;
  // Firmware version
  firmware?: number;

  // = optionalParams.hasOwnProperty("EveAqua_flowrate") ? optionalParams.EveAqua_flowrate : 18;
  // 18 L/Min default
  flowrate?: number;

  // = optionalParams.hasOwnProperty("EveAqua_enableschedule") ? optionalParams.EveAqua_enableschedule : false;
  // Schedules on/off

  enableschedule?: boolean;
  // = "441105" + (this.__EveAquaPersist.enableschedule == true ? "03" : "02") + "00000000000000000000000000000";
  // schedule status. on or off
  command44?: string;
  command45?: string; // = "4509050200000008000800"; // No Schedules defined
  command46?: string; // = "4609050000000f00000000"; // No days defined for schedules
}

export abstract class EveAquaAccessory extends EveBaseAccessory {
  protected readonly Characteristic: typeof Characteristic &
    typeof EveGetConfigurationType &
    typeof EveSetConfigurationType = this.api.hap.Characteristic;

  protected readonly EveGetConfiguration;
  protected readonly EveSetConfiguration;

  private eveConfig: EveAquaConfig;

  constructor(
    protected api: API,
    protected config: AccessoryConfig,
    protected logger: Logging,
  ) {
      super(api, config, logger);

      this.eveConfig = {
          firmware: 1208, // Firmware version
          flowrate: 18, // 18 L/Min default
          enableschedule: false,
          command44:
        '441105' +
        '02' /*enableschedule: false*/ +
        '00000000000000000000000000000', // schedule status. on or off
          command45: '4509050200000008000800', // No Schedules defined
          command46: '4609050000000f00000000', // No days defined for schedules
      };
  }

  protected async getEveConfiguration(): Promise<string> {
      return await this.getAquaDetails();
  }

  protected abstract getAccessory(): AccessoryPlugin;

  protected getAccessoryType(): string {
      return 'aqua';
  }

  async getAquaDetails(): Promise<string> {
      const history = await this.historyService.readHistory();
      // Calculate total water usage over history period
      let totalWater = 0;
      history.forEach((historyEntry) => {
          if (historyEntry.status === 0) {
              // add to total water usage if we have a valve closed event
              totalWater += historyEntry['water'];
          }
      });

      const value = format(
          '0002 2300 0302 %s d004 %s 9b04 %s 2f0e %s 0000 2e02 %s %s %s %s 0000000000000000 1e02 2300 0c',
          numberToEveHexString(this.eveConfig.firmware!, 4), // firmware version (build xxxx)
          numberToEveHexString(
              history.length !== 0 ? history[history.length - 1].time : 0,
              8,
          ), // time of last event, 0 if never watered
          numberToEveHexString(Math.floor(new Date().getTime() / 1000), 8), // "now" time
          numberToEveHexString(Math.floor(totalWater * 1000), 16), // total water usage in ml (64bit value)
          numberToEveHexString(
              Math.floor((this.eveConfig.flowrate! * 1000) / 60),
              4,
          ), // water flow rate (16bit value)
          this.eveConfig.command44,
          this.eveConfig.command45,
          this.eveConfig.command46,
      );

      return encodeEveData(value);
  }

  protected async setEveConfiguration(
      value: CharacteristicValue,
  ): Promise<boolean> {
      const processedData: EveAquaConfig = {};
      // Loop through set commands passed to us
      const programs: EvePrograms[] = [];
      const valHex = decodeEveData(value.toString());
      let index = 0;
      while (index < valHex.length) {
      // first byte is command in this data stream
      // second byte is size of data for command
          const command = valHex.substr(index, 2);
          const size = parseInt(valHex.substr(index + 2, 2), 16) * 2;
          const data = valHex.substr(
              index + 4,
              parseInt(valHex.substr(index + 2, 2), 16) * 2,
          );
          switch (command) {
              case '2e': {
                  // flow rate in L/Minute
                  this.eveConfig.flowrate = Number.parseFloat(
                      ((EveHexStringToNumber(data) * 60) / 1000).toFixed(1),
                  );
                  processedData.flowrate = this.eveConfig.flowrate;
                  break;
              }

              case '2f': {
                  // reset timestamp in seconds since EPOCH
                  this.eveConfig.timestamp = EPOCH_OFFSET + EveHexStringToNumber(data);
                  processedData.timestamp = this.eveConfig.timestamp;
                  break;
              }

              case '44': {
                  // Schedules on/off and Timezone/location information
                  const subCommand = EveHexStringToNumber(data.substr(2, 4));
                  this.eveConfig.command44 =
            command + valHex.substr(index + 2, 2) + data;
                  this.eveConfig.enableschedule = (subCommand & 0x01) === 0x01; // Bit 1 is schedule status on/off
                  if ((subCommand & 0x10) === 0x10) {
                      this.eveConfig.utcoffset =
              EveHexStringToNumber(data.substr(10, 8)) * 60;
                  } // Bit 5 is UTC offset in seconds
                  if ((subCommand & 0x04) === 0x04) {
                      this.eveConfig.latitude = Number.parseFloat(
                          EveHexStringToFloat(data.substr(18, 8), 7),
                      );
                  } // Bit 4 is lat/long information
                  if ((subCommand & 0x04) === 0x04) {
                      this.eveConfig.longitude = Number.parseFloat(
                          EveHexStringToFloat(data.substr(26, 8), 7),
                      );
                  } // Bit 4 is lat/long information
                  if ((subCommand & 0x02) === 0x02) {
                      // If bit 2 is set, indicates just a schedule on/off command
                      processedData.enabled = this.eveConfig.enableschedule;
                  }
                  if ((subCommand & 0x02) !== 0x02) {
                      // If bit 2 is not set, this command includes Timezone/location information
                      processedData.utcoffset = this.eveConfig.utcoffset;
                      processedData.latitude = this.eveConfig.latitude;
                      processedData.longitude = this.eveConfig.longitude;
                  }
                  break;
              }

              case '45': {
                  // Eve App Scheduling Programs
                  this.eveConfig.command45 =
            command + valHex.substr(index + 2, 2) + data;
                  const programcount = EveHexStringToNumber(data.substr(2, 2)); // Number of defined programs
                  const unknown = EveHexStringToNumber(data.substr(4, 6)); // Unknown data for 6 bytes

                  for (
                      let index2 = parseInt(data.substr(0, 2), 16) * 2;
                      index2 < data.length;
                      index2 += 2
                  ) {
                      if (
                          data.substr(index2, 2) === '0a' ||
              data.substr(index2, 2) === '0b'
                      ) {
                          const times: EveProgramSchedule[] = [];
                          let index3 = 0;
                          for (
                              index3 = 0;
                              index3 < parseInt(data.substr(index2 + 2, 2), 16) &&
                parseInt(data.substr(index2 + 2, 2), 16) !== 8;
                              index3++
                          ) {
                              // decode start time
                              const start = parseInt(
                  data
                      .substr(index2 + 4 + index3 * 8, 4)
                      .match(/[a-fA-F0-9]{2}/g)!
                      .reverse()
                      .join(''),
                  16,
                              );
                              const start_min = null;
                              const start_hr = null;
                              const start_offset = null;
                              const start_sunrise = null;
                              if ((start & 0x1f) == 5) {
                                  // specific time
                                  const start_min = (start >>> 5) % 60; // Start minute
                                  const start_hr = ((start >>> 5) - start_min) / 60; // Start hour
                                  const start_offset = (start >>> 5) * 60; // Seconds since 00:00
                              } else if ((start & 0x1f) == 7) {
                                  // sunrise/sunset
                                  const start_sunrise = (start >>> 5) & 0x01; // 1 = sunrise, 0 = sunset
                                  const start_offset =
                    (start >>> 6) & 0x01
                        ? ~((start >>> 7) * 60) + 1
                        : (start >>> 7) * 60; // offset from sunrise/sunset (plus/minus value)
                              }

                              // decode end time
                              const end = parseInt(
                  data
                      .substr(index2 + 4 + (index3 * 8 + 4), 4)
                      .match(/[a-fA-F0-9]{2}/g)!
                      .reverse()
                      .join(''),
                  16,
                              );
                              let end_min = 0;
                              let end_hr = 0;
                              let end_offset = 0;
                              let end_sunrise = 0;
                              if ((end & 0x1f) == 1) {
                                  // specific time
                                  end_min = (end >>> 5) % 60; // End minute
                                  end_hr = ((end >>> 5) - end_min) / 60; // End hour
                                  end_offset = (end >>> 5) * 60; // Seconds since 00:00
                              } else if ((end & 0x1f) == 3) {
                                  end_sunrise = (end >>> 5) & 0x01; // 1 = sunrise, 0 = sunset
                                  end_offset =
                    (end >>> 6) & 0x01
                        ? ~((end >>> 7) * 60) + 1
                        : (end >>> 7) * 60; // offset from sunrise/sunset (plus/minus value)
                              }

                              times.push({
                                  type:
                    start_sunrise == 0
                        ? 'time'
                        : start_sunrise
                            ? 'sunrise'
                            : 'sunset',
                                  offset: start_offset!,
                                  duration: end_offset - start_offset!,
                              });
                          }
                          programs.push({
                              id: programs.length + 1,
                              days: [],
                              schedule: times,
                          });
                          index2 += index3 * 8;
                      }
                  }
                  break;
              }

              case '46': {
                  // Eve App active days across programs
                  this.eveConfig.command46 =
            command + valHex.substr(index + 2, 2) + data;
                  const unkn = EveHexStringToNumber(data.substr(0, 6)); // Unknown data for first 6 bytes
                  const daysbitmask = EveHexStringToNumber(data.substr(8, 6)) >>> 4;
                  const daysofweek = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                  programs.forEach((program) => {
                      for (let index = 0; index < daysofweek.length; index++) {
                          if (((daysbitmask >>> (index * 3)) & 0x7) == program.id) {
                              program.days.push(daysofweek[index]);
                          }
                      }
                  });

                  processedData.programs = programs;
                  break;
              }

              case '47': {
                  // Eve App DST information
                  this.eveConfig.command47 =
            command + valHex.substr(index + 2, 2) + data;
                  break;
              }

              case '4b': {
                  // Eve App suspension scene triggered from HomeKit
                  processedData.days = EveHexStringToNumber(data.substr(0, 8)) / 1440; // 1440 mins in a day
                  break;
              }

              case 'b1': {
                  this.eveConfig.childlock = false;
                  // Child lock on/off. Seems data packet is always same (0100),
                  //so inspect "Characteristic.LockPhysicalControls)" for actual status
                  //       this.aquaConfig.childlock =
                  // service.getCharacteristic(Characteristic.LockPhysicalControls)
                  //     .value == Characteristic.CONTROL_LOCK_ENABLED
                  //     ? true
                  //     : false;
                  //       processedData.childlock = this.aquaConfig.childlock;
                  break;
              }

              default: {
                  this.logger.info(
                      'DEBUG: Unknown Eve Aqua command \'%s\' with data \'%s\'',
                      command,
                      data,
                  );
                  break;
              }
          }
          index += 4 + size; // Move to next command accounting for header size of 4 bytes
      }

      // Send complete processed command data if configured to our callback
      //   if (
      //       typeof optionalParams.SetCommand === 'function' &&
      //   Object.keys(processedData).length != 0
      //   ) {
      //       optionalParams.SetCommand(processedData);
      //   }
      //   callback();
      return true;
  }
}
