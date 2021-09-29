
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

# Virtual Irrigation plugin for Homebridge with Eve watering history



## Requirements 
- NodeJS (>=8.9.3) with NPM (>=6.4.1)

## Endpoint for watering log
This plugin supports temperature updates from http web hook. You can enable HomeKit automation to send watering status information.
Once plugin is started, it starts http server with port httpPort. Currently plugin supports URL (example with Homebridge Raspberry Pi setup and default httpPort: 5678):
```
GET http://homebridge.localhost:5678/watering/1
```

## Eve app usage history

- usage updates are stored using fakegato lib, so when open irrigation accessory with Eve app its possible to see watering  history

Fakegato  open source project [fakegato-history](https://github.com/simont77/fakegato-history). 



## Usage Example:
```
{
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "123-45-568"
    },
    "accessories": [
        {
            "accessory": "VirtualIrrigationEve",
            "name": "Virtual Irrigation System",
            "httpPort": 5678,
        }
    ]
}
```