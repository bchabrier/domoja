import { Source, ConfigLoader, GenericDevice, InitObject, Parameters } from '..';

/**
 * Source used for the demo mode
 * 
 */
export class demo extends Source {
    createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
        return new demo(path);
    }
    getParameters(): Parameters {
        return {};
    }
    doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
        return callback(null);
    }

    static registerDeviceTypes(): void {
        
		Source.registerDeviceType(this, 'device', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			location: 'OPTIONAL'
		});

		Source.registerDeviceType(this, 'sensor', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			transform: 'OPTIONAL',
			camera: 'OPTIONAL' // added for alarm (should be an array)
		});
	}
}



