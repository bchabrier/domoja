import { ConfigLoader } from '../lib/load';

export interface InitObject {
    [prop: string]: any
}

export interface Parameters {
    [parameter: string]: 'REQUIRED' | 'OPTIONAL' | 'AT_LEAST_ONE'
}

export interface DomoModule {
    release(): void;
    configLoader: ConfigLoader;
	isReleased(): boolean;


    // should be static but not supported
    createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): DomoModule;
    //getParameters(): Parameters;
}

