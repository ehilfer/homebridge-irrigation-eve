export function numberToEveHexString(n: number, bytes: number): string {
    if (typeof n !== 'number') {
        return n;
    }
    const tempString = '0000000000000000' + n.toString(16);
    return tempString.slice(-1 * bytes).match(/[a-fA-F0-9]{2}/g)!.reverse().join('');
}


export function encodeEveData (s: string): string {
    return Buffer.from(('' + s).replace(/[^a-fA-F0-9]/ig, ''), 'hex').toString('base64');
}

export function decodeEveData (data: string): string {
    if (typeof data !== 'string') {
        return data;
    }
    return Buffer.from(data, 'base64').toString('hex');
}

// Converts Eve encoded hex string to number
export function EveHexStringToNumber (s: string): number{
    if (typeof s !== 'string') {
        return s;
    }
    const tempString = s.match(/[a-fA-F0-9]{2}/g)!.reverse().join('');
    return Number(`0x${tempString}`);   // convert to number on return
}

export function EveHexStringToFloat (s: string, precision: number): string {
    if (typeof s !== 'string') {
        return s;
    }
    const tempString = s.match(/[a-fA-F0-9]{2}/g)!.reverse().join('');
    const hexString = tempString !== undefined? tempString.toString(): '';
    const float = new Buffer(hexString, 'hex').readFloatBE(0);
    return (precision !== 0) ? float.toFixed(precision).toString() : float.toString();
}
