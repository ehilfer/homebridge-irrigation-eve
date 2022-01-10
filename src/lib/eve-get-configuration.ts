import { API } from 'homebridge';

export = (api: API) => {
    const Characteristic = api.hap.Characteristic;

    return class EveGetConfiguration extends Characteristic {
    static readonly UUID: string = 'E863F131-079E-48FF-8F27-9C2605A29F52';

    constructor() {
        super('Eve Get Configuration', EveGetConfiguration.UUID, {
            format: Characteristic.Formats.DATA,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
    }
    };
};
