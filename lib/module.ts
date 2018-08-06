import { ConfigLoader } from '../lib/load';

export interface InitObject {
    [prop: string]: any
}

export interface Parameters {
    [parameter: string]: 'REQUIRED' | 'OPTIONAL'
}

export interface DomoModule {
    release(): void;

    // should be static but not supported
    createInstance(configLoader: ConfigLoader, id: string, initObject: InitObject): DomoModule;
    //getParameters(): Parameters;
}

