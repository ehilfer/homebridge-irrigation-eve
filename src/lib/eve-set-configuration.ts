import { API } from 'homebridge';

export = (api: API) => {
    const Characteristic = api.hap.Characteristic;

    return class EveSetConfiguration extends Characteristic {
    static readonly UUID: string = 'E863F11D-079E-48FF-8F27-9C2605A29F52';

    constructor() {
        super('Eve Set Configuration', EveSetConfiguration.UUID, {
            format: Characteristic.Formats.DATA,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
    }
    };
};
